"""IngestHub CLI — main entry point.

Usage:
    data_ingest ingest /path/to/data --project MyProject --subject "John Doe" --package "shoot_2024-01-15"
    data_ingest list projects
    data_ingest list subjects --project MyProject
    data_ingest list packages --project MyProject --subject "John Doe"
    data_ingest status
"""

import os
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeRemainingColumn,
)
from rich.table import Table

from . import __version__, db, media

console = Console()

# ── Globals ─────────────────────────────────────────────────

DEFAULT_PROXY_DIR = os.environ.get("INGESTHUB_PROXY_DIR", "")


def _resolve_proxy_dir(source_path: Path, proxy_dir: str | None) -> Path:
    """Determine where to store proxies/thumbnails."""
    if proxy_dir:
        return Path(proxy_dir)
    if DEFAULT_PROXY_DIR:
        return Path(DEFAULT_PROXY_DIR)
    # Default: .ingesthub_proxies alongside the source folder
    return source_path / ".ingesthub_proxies"


# ── CLI group ───────────────────────────────────────────────


@click.group()
@click.version_option(version=__version__)
def cli():
    """IngestHub CLI — ingest and manage media datasets."""
    pass


# ── INGEST command ──────────────────────────────────────────


@cli.command()
@click.argument("source_path", type=click.Path(exists=True, file_okay=False))
@click.option("--project", "-p", required=True, help="Project name (created if doesn't exist)")
@click.option("--project-type", type=click.Choice(["atman", "vfx"]), default="atman", help="Project type")
@click.option("--subject", "-s", required=True, help="Subject name (created if doesn't exist)")
@click.option("--package", "-k", required=True, help="Package/batch name (must be unique per subject)")
@click.option("--description", "-d", default="", help="Description of this package/data source")
@click.option("--tags", "-t", multiple=True, help="Tags for this package (repeatable: -t tag1 -t tag2)")
@click.option("--proxy-dir", default=None, help="Directory for proxy files (default: <source>/.ingesthub_proxies)")
@click.option("--proxy-height", default=720, help="Max height for video proxies (default: 720)")
@click.option("--skip-proxies", is_flag=True, help="Skip proxy/thumbnail generation")
@click.option("--recursive/--no-recursive", default=True, help="Recurse into subdirectories (default: yes)")
@click.option("--force", is_flag=True, help="Re-ingest even if package already exists (deletes existing)")
@click.option("--dry-run", is_flag=True, help="Scan files and show what would be ingested without writing to DB")
def ingest(
    source_path: str,
    project: str,
    project_type: str,
    subject: str,
    package: str,
    description: str,
    tags: tuple,
    proxy_dir: str | None,
    proxy_height: int,
    skip_proxies: bool,
    recursive: bool,
    force: bool,
    dry_run: bool,
):
    """Ingest a directory of media files into IngestHub.

    Scans SOURCE_PATH for video and image files, extracts metadata via ffprobe,
    generates web-playable proxies and thumbnails, and registers everything in
    the database.

    Example:
        data_ingest ingest ./raw_footage --project "ProjectX" --subject "Jane Doe" --package "shoot_jan15" --tags "studio" --tags "4k"
    """
    source = Path(source_path).resolve()
    proxy_base = _resolve_proxy_dir(source, proxy_dir)

    console.print(
        Panel.fit(
            f"[bold cyan]IngestHub — Ingesting Package[/]\n\n"
            f"  Source:   {source}\n"
            f"  Project:  {project} ({project_type})\n"
            f"  Subject:  {subject}\n"
            f"  Package:  {package}\n"
            f"  Tags:     {', '.join(tags) if tags else '(none)'}\n"
            f"  Proxies:  {'SKIP' if skip_proxies else str(proxy_base)}\n"
            f"  Mode:     {'DRY RUN' if dry_run else 'LIVE'}",
            border_style="cyan",
        )
    )

    # ── Scan files ──────────────────────────────────────────
    console.print("\n[bold]Scanning files...[/]")

    if recursive:
        all_files = sorted(f for f in source.rglob("*") if f.is_file())
    else:
        all_files = sorted(f for f in source.iterdir() if f.is_file())

    # Skip hidden files and proxy directories
    all_files = [f for f in all_files if not any(part.startswith(".") for part in f.relative_to(source).parts)]

    # Classify
    classified = []
    for f in all_files:
        ftype = media.classify_file(f)
        if ftype != "other":
            classified.append((f, ftype))

    if not classified:
        console.print("[red]No media files (video/image) found in source path.[/]")
        sys.exit(1)

    video_count = sum(1 for _, t in classified if t == "video")
    image_count = sum(1 for _, t in classified if t == "image")
    console.print(
        f"  Found [green]{len(classified)}[/] media files ([blue]{video_count}[/] video, [blue]{image_count}[/] image)"
    )

    if dry_run:
        _print_dry_run(classified, source)
        return

    # ── Database setup ──────────────────────────────────────
    console.print("\n[bold]Connecting to database...[/]")

    with db.get_db() as conn:
        # Create/get project & subject
        project_id = db.get_or_create_project(conn, project, project_type=project_type)
        subject_id = db.get_or_create_subject(conn, project_id, subject)

        console.print(f"  Project: {project} [dim]({project_id})[/]")
        console.print(f"  Subject: {subject} [dim]({subject_id})[/]")

        # Handle --force (delete existing package)
        if force:
            try:
                pkg_id = db.create_package(conn, subject_id, package, str(source), description, list(tags))
            except ValueError:
                console.print(f"  [yellow]⚠ Package '{package}' exists, --force: deleting and re-creating[/]")
                cur = conn.cursor()
                cur.execute(
                    "SELECT id FROM packages WHERE subject_id = %s AND name = %s",
                    (subject_id, package),
                )
                old_id = cur.fetchone()[0]
                db.delete_package(conn, old_id)
                pkg_id = db.create_package(conn, subject_id, package, str(source), description, list(tags))
        else:
            try:
                pkg_id = db.create_package(conn, subject_id, package, str(source), description, list(tags))
            except ValueError as e:
                console.print(f"[red]✗ {e}[/]")
                sys.exit(1)

        console.print(f"  Package: {package} [dim]({pkg_id})[/]")

        # ── Process files ───────────────────────────────────
        console.print("\n[bold]Processing assets...[/]")

        total_size = 0
        assets = []
        first_thumb = None

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            MofNCompleteColumn(),
            TimeRemainingColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Processing", total=len(classified))

            for filepath, file_type in classified:
                progress.update(task, description=f"[cyan]{filepath.name}[/]")
                rel_path = filepath.relative_to(source)
                file_size = filepath.stat().st_size
                total_size += file_size

                # ── Probe metadata ──────────────────────────
                if file_type == "video":
                    probe = media.probe_video(filepath)
                else:
                    probe = media.probe_image(filepath)

                # ── Generate proxy & thumbnail ──────────────
                proxy_path = None
                thumb_path = None

                if not skip_proxies:
                    asset_proxy_dir = proxy_base / str(rel_path.parent)

                    if file_type == "video":
                        # Only generate proxy for non-web codecs, or always
                        # for consistency (web codecs are fast to transcode)
                        if probe.get("needs_proxy", True):
                            proxy_path = media.generate_video_proxy(filepath, asset_proxy_dir, max_height=proxy_height)
                        else:
                            # Web-playable: use original as proxy
                            proxy_path = filepath

                        thumb_path = media.generate_video_thumbnail(filepath, asset_proxy_dir)
                    else:
                        proxy_path = media.generate_image_proxy(filepath, asset_proxy_dir)
                        thumb_path = media.generate_image_thumbnail(filepath, asset_proxy_dir)

                    # Track first thumbnail for subject thumbnail
                    if thumb_path and not first_thumb:
                        first_thumb = thumb_path

                # ── Build asset record ──────────────────────
                asset = {
                    "package_id": pkg_id,
                    "filename": str(rel_path),
                    "file_type": file_type,
                    "mime_type": media.get_mime_type(filepath),
                    "file_size_bytes": file_size,
                    "disk_path": str(filepath),
                    "proxy_path": str(proxy_path) if proxy_path else None,
                    "thumbnail_path": str(thumb_path) if thumb_path else None,
                    "width": probe.get("width"),
                    "height": probe.get("height"),
                    "duration_seconds": probe.get("duration_seconds"),
                    "codec": probe.get("codec"),
                    "camera": probe.get("camera"),
                    "tags": [],
                    "metadata": probe.get("metadata", {}),
                }
                assets.append(asset)
                progress.advance(task)

        # ── Write to DB ─────────────────────────────────────
        console.print(f"\n[bold]Writing {len(assets)} assets to database...[/]")
        count = db.bulk_insert_assets(conn, assets)

        # Update package stats
        db.update_package_stats(conn, pkg_id, count, total_size, status="ready")

        # Set subject thumbnail if none exists
        if first_thumb:
            db.update_subject_thumbnail(conn, subject_id, str(first_thumb))

        conn.commit()

    # ── Summary ─────────────────────────────────────────────
    console.print(
        Panel.fit(
            f"[bold green]✓ Ingest complete![/]\n\n"
            f"  Assets ingested:  {count}\n"
            f"  Total size:       {_fmt_size(total_size)}\n"
            f"  Videos:           {video_count}\n"
            f"  Images:           {image_count}\n"
            f"  Package ID:       {pkg_id}",
            border_style="green",
        )
    )


# ── LIST command ────────────────────────────────────────────


@cli.group("list")
def list_cmd():
    """List projects, subjects, or packages."""
    pass


@list_cmd.command("projects")
def list_projects():
    """List all projects."""
    with db.get_db() as conn:
        projects = db.list_projects(conn)

    if not projects:
        console.print("[dim]No projects found.[/]")
        return

    table = Table(title="Projects", show_lines=True)
    table.add_column("Name", style="cyan")
    table.add_column("Type", style="magenta")
    table.add_column("Subjects", justify="right")
    table.add_column("Packages", justify="right")
    table.add_column("Assets", justify="right")
    table.add_column("Size", justify="right")
    table.add_column("Created", style="dim")

    for p in projects:
        table.add_row(
            p["name"],
            p["project_type"],
            str(p["subject_count"]),
            str(p["package_count"]),
            str(p["total_assets"]),
            _fmt_size(p["total_size_bytes"]),
            str(p["created_at"].strftime("%Y-%m-%d")),
        )

    console.print(table)


@list_cmd.command("subjects")
@click.option("--project", "-p", required=True, help="Project name")
def list_subjects(project: str):
    """List subjects in a project."""
    with db.get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM projects WHERE name = %s", (project,))
        row = cur.fetchone()
        if not row:
            console.print(f"[red]Project '{project}' not found.[/]")
            sys.exit(1)
        project_id = row[0]

        cur = conn.cursor(cursor_factory=__import__("psycopg2").extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM v_subject_summary WHERE project_id = %s ORDER BY name",
            (project_id,),
        )
        subjects = cur.fetchall()

    if not subjects:
        console.print(f"[dim]No subjects in project '{project}'.[/]")
        return

    table = Table(title=f"Subjects — {project}", show_lines=True)
    table.add_column("Name", style="cyan")
    table.add_column("Packages", justify="right")
    table.add_column("Assets", justify="right")
    table.add_column("Size", justify="right")

    for s in subjects:
        table.add_row(
            s["name"],
            str(s["package_count"]),
            str(s["total_assets"]),
            _fmt_size(s["total_size_bytes"]),
        )

    console.print(table)


@list_cmd.command("packages")
@click.option("--project", "-p", required=True, help="Project name")
@click.option("--subject", "-s", required=True, help="Subject name")
def list_packages(project: str, subject: str):
    """List packages for a subject."""
    with db.get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT pkg.* FROM packages pkg
            JOIN subjects s ON s.id = pkg.subject_id
            JOIN projects p ON p.id = s.project_id
            WHERE p.name = %s AND s.name = %s
            ORDER BY pkg.ingested_at DESC
            """,
            (project, subject),
        )
        columns = [desc[0] for desc in cur.description]
        packages = [dict(zip(columns, row)) for row in cur.fetchall()]

    if not packages:
        console.print(f"[dim]No packages found for {project}/{subject}.[/]")
        return

    table = Table(title=f"Packages — {project} / {subject}", show_lines=True)
    table.add_column("Name", style="cyan")
    table.add_column("Status", style="magenta")
    table.add_column("Files", justify="right")
    table.add_column("Size", justify="right")
    table.add_column("Tags")
    table.add_column("Ingested", style="dim")

    status_colors = {"ingested": "blue", "processing": "yellow", "ready": "green", "error": "red"}

    for pkg in packages:
        status = pkg["status"]
        color = status_colors.get(status, "white")
        tags_str = ", ".join(pkg["tags"]) if pkg["tags"] else "-"
        table.add_row(
            pkg["name"],
            f"[{color}]{status}[/{color}]",
            str(pkg["file_count"]),
            _fmt_size(pkg["total_size_bytes"]),
            tags_str,
            str(pkg["ingested_at"].strftime("%Y-%m-%d %H:%M")),
        )

    console.print(table)


# ── STATUS command ──────────────────────────────────────────


@cli.command()
def status():
    """Show database connection status and overall stats."""
    console.print("[bold]Checking database connection...[/]")

    try:
        with db.get_db() as conn:
            cur = conn.cursor()

            cur.execute("SELECT count(*) FROM projects")
            project_count = cur.fetchone()[0]

            cur.execute("SELECT count(*) FROM subjects")
            subject_count = cur.fetchone()[0]

            cur.execute("SELECT count(*) FROM packages")
            package_count = cur.fetchone()[0]

            cur.execute("SELECT count(*), COALESCE(SUM(file_size_bytes), 0) FROM assets")
            asset_count, total_bytes = cur.fetchone()

        console.print(
            Panel.fit(
                f"[bold green]✓ Connected to database[/]\n\n"
                f"  Projects:  {project_count}\n"
                f"  Subjects:  {subject_count}\n"
                f"  Packages:  {package_count}\n"
                f"  Assets:    {asset_count}\n"
                f"  Total:     {_fmt_size(total_bytes)}",
                border_style="green",
            )
        )

    except Exception as e:
        console.print(f"[red]✗ Could not connect to database: {e}[/]")
        console.print(f"[dim]  Connection: {db.get_connection_string()}[/]")
        sys.exit(1)


# ── Helpers ─────────────────────────────────────────────────


def _fmt_size(size_bytes: int) -> str:
    """Format bytes into human-readable size."""
    if not size_bytes:
        return "0 B"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(size_bytes) < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def _print_dry_run(classified: list, source: Path):
    """Print a summary of what would be ingested."""
    console.print("\n[bold yellow]DRY RUN — no data will be written[/]\n")

    table = Table(title="Files to ingest", show_lines=False)
    table.add_column("File", style="cyan", max_width=60)
    table.add_column("Type", style="magenta")
    table.add_column("Size", justify="right")

    total_size = 0
    for filepath, file_type in classified:
        size = filepath.stat().st_size
        total_size += size
        rel = filepath.relative_to(source)
        table.add_row(str(rel), file_type, _fmt_size(size))

    console.print(table)
    console.print(f"\n  Total: [green]{len(classified)}[/] files, [green]{_fmt_size(total_size)}[/]")


if __name__ == "__main__":
    cli()
