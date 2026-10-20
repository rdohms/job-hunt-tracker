// Minimal, safe markdown renderer: escapes HTML first, then applies a small subset.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function renderMarkdown(src) {
  const lines = esc(src).split('\n');
  const out = [];
  let i = 0;
  let taskIndex = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
    } else if (/^#{1,6}\s/.test(line)) {
      const n = /^#+/.exec(line)[0].length;
      out.push(`<h${n}>${inline(line.replace(/^#+\s+/, ''))}</h${n}>`);
      i++;
    } else if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s/.test(lines[i])) {
        let t = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        const task = /^\[( |x)\]\s+(.*)/i.exec(t);
        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          t = `<label><input type="checkbox" data-task="${taskIndex++}"${checked ? ' checked' : ''}> ${inline(task[2])}</label>`;
          items.push(`<li class="task">${t}</li>`);
        } else {
          items.push(`<li>${inline(t)}</li>`);
        }
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (/^&gt;\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(lines[i++].replace(/^&gt;\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
    } else if (/^---+$/.test(line.trim())) {
      out.push('<hr>');
      i++;
    } else if (!line.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*([-*+]|\d+\.)\s|&gt;)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join('<br>'))}</p>`);
    }
  }
  return out.join('\n');
}

// Toggle the Nth task checkbox in raw markdown source.
export function toggleTask(src, index) {
  let n = 0;
  return src.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[( |x)\]/gim, (m, pre, mark) =>
    n++ === index ? `${pre}[${mark === ' ' ? 'x' : ' '}]` : m
  );
}
