import * as fs from 'fs';
import * as path from 'path';
import { VaultNote } from '../types';

export class ObsidianService {
  private readonly vaultPath: string;

  constructor(vaultPath?: string) {
    this.vaultPath =
      vaultPath ||
      process.env.OBSIDIAN_VAULT_PATH ||
      path.join(process.cwd(), 'vault');

    if (!fs.existsSync(this.vaultPath)) {
      fs.mkdirSync(this.vaultPath, { recursive: true });
    }
  }

  // ─── Leitura ──────────────────────────────────────────────────────────────

  readNote(notePath: string): VaultNote | null {
    const fullPath = this.resolvePath(notePath);
    if (!fs.existsSync(fullPath)) return null;

    const content = fs.readFileSync(fullPath, 'utf-8');
    return this.parseNote(notePath, content);
  }

  listNotes(folder: string): VaultNote[] {
    const folderPath = path.join(this.vaultPath, folder);
    if (!fs.existsSync(folderPath)) return [];

    const files = fs
      .readdirSync(folderPath)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(folderPath, a));
        const statB = fs.statSync(path.join(folderPath, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    return files
      .map((f) => this.readNote(path.join(folder, f)))
      .filter((n): n is VaultNote => n !== null);
  }

  searchNotes(query: string, folder?: string): VaultNote[] {
    const searchIn = folder ? [folder] : this.listFolders();
    const results: VaultNote[] = [];
    const lowerQuery = query.toLowerCase();

    for (const dir of searchIn) {
      const notes = this.listNotes(dir);
      for (const note of notes) {
        if (
          note.content.toLowerCase().includes(lowerQuery) ||
          note.filename.toLowerCase().includes(lowerQuery)
        ) {
          results.push(note);
        }
      }
    }

    return results;
  }

  getRecentNotes(folder: string, limit = 5): VaultNote[] {
    return this.listNotes(folder).slice(0, limit);
  }

  // ─── Escrita ──────────────────────────────────────────────────────────────

  writeNote(notePath: string, content: string, frontmatter?: Record<string, unknown>): VaultNote {
    const fullPath = this.resolvePath(notePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const now = new Date().toISOString().split('T')[0];
    const fm = { criado: now, atualizado: now, ...frontmatter };
    const fullContent = this.buildContent(fm, content);

    fs.writeFileSync(fullPath, fullContent, 'utf-8');
    return this.parseNote(notePath, fullContent);
  }

  appendToNote(notePath: string, content: string): void {
    const fullPath = this.resolvePath(notePath);
    if (!fs.existsSync(fullPath)) {
      this.writeNote(notePath, content);
      return;
    }

    const existing = fs.readFileSync(fullPath, 'utf-8');
    // Atualiza o frontmatter 'atualizado'
    const updated = existing.replace(
      /^(---[\s\S]*?atualizado: )[\d-]+([\s\S]*?---)/m,
      `$1${new Date().toISOString().split('T')[0]}$2`,
    );
    fs.writeFileSync(fullPath, updated + '\n\n' + content, 'utf-8');
  }

  updateFrontmatter(notePath: string, updates: Record<string, unknown>): void {
    const note = this.readNote(notePath);
    if (!note) return;

    const newFm = { ...note.frontmatter, ...updates, atualizado: new Date().toISOString().split('T')[0] };
    const bodyWithoutFm = note.content.replace(/^---[\s\S]*?---\n/, '');
    const newContent = this.buildContent(newFm, bodyWithoutFm);
    const fullPath = this.resolvePath(notePath);
    fs.writeFileSync(fullPath, newContent, 'utf-8');
  }

  // ─── Context builder ──────────────────────────────────────────────────────

  buildContextSummary(folders: string[], limit = 3): string {
    const parts: string[] = [];

    for (const folder of folders) {
      const notes = this.getRecentNotes(folder, limit);
      if (notes.length === 0) continue;

      parts.push(`\n### ${folder}`);
      for (const note of notes) {
        const preview = note.content.replace(/^---[\s\S]*?---\n/, '').slice(0, 400).trim();
        parts.push(`**[[${note.filename.replace('.md', '')}]]**\n${preview}...`);
      }
    }

    return parts.join('\n\n');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolvePath(notePath: string): string {
    if (notePath.endsWith('.md')) return path.join(this.vaultPath, notePath);
    return path.join(this.vaultPath, notePath + '.md');
  }

  private listFolders(): string[] {
    return fs
      .readdirSync(this.vaultPath)
      .filter((f) => fs.statSync(path.join(this.vaultPath, f)).isDirectory());
  }

  private parseFrontmatter(content: string): Record<string, unknown> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const fm: Record<string, unknown> = {};
    for (const line of match[1].split('\n')) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        fm[key.trim()] = valueParts.join(':').trim();
      }
    }
    return fm;
  }

  private extractLinks(content: string): string[] {
    const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
    return [...matches].map((m) => m[1]);
  }

  private parseNote(notePath: string, content: string): VaultNote {
    const filename = path.basename(notePath);
    const stats = (() => {
      try {
        return fs.statSync(this.resolvePath(notePath));
      } catch {
        return null;
      }
    })();

    return {
      path: notePath,
      filename,
      content,
      frontmatter: this.parseFrontmatter(content),
      links: this.extractLinks(content),
      createdAt: stats?.birthtime.toISOString() ?? new Date().toISOString(),
      updatedAt: stats?.mtime.toISOString() ?? new Date().toISOString(),
    };
  }

  private buildContent(frontmatter: Record<string, unknown>, body: string): string {
    const fmLines = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return `---\n${fmLines}\n---\n\n${body}`;
  }
}
