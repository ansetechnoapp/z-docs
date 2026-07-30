function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function slugifyHeading(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractHeadings(md) {
  const headings = [];
  const source = String(md || "");
  const matcher = /^(#{1,4})\s+(.+)$/gm;
  let match;

  while ((match = matcher.exec(source)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    headings.push({
      level,
      text,
      id: slugifyHeading(text),
    });
  }

  return headings;
}

export function renderMarkdown(md) {
  if (!md) return "";

  const codeBlocks = [];
  let html = escapeHtml(md);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(
      `<pre><code class="language-${lang || "text"}">${code.trim()}</code></pre>`,
    );
    return token;
  });

  html = html.replace(/^#### (.+)$/gm, (_, text) => {
    const id = slugifyHeading(text);
    return `<h4 id="${id}">${text}</h4>`;
  });
  html = html.replace(/^### (.+)$/gm, (_, text) => {
    const id = slugifyHeading(text);
    return `<h3 id="${id}">${text}</h3>`;
  });
  html = html.replace(/^## (.+)$/gm, (_, text) => {
    const id = slugifyHeading(text);
    return `<h2 id="${id}">${text}</h2>`;
  });
  html = html.replace(/^# (.+)$/gm, (_, text) => {
    const id = slugifyHeading(text);
    return `<h1 id="${id}">${text}</h1>`;
  });

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`);

  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  html = html.replace(/^\|(.+)\|$/gm, (_, row) => {
    const cells = row
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    const rendered = cells.map((cell) => `<td>${cell}</td>`).join("");
    return `<tr>${rendered}</tr>`;
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>(\n|$))+/g, (match) => {
    const cleaned = match.replace(/<tr><td>[-:]+<\/td>(?:<td>[-:]+<\/td>)*<\/tr>/g, "");
    return `<table>${cleaned}</table>`;
  });

  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  for (let i = 0; i < codeBlocks.length; i += 1) {
    html = html.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-6]>)/g, "$1");
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<pre>)/g, "$1");
  html = html.replace(/(<\/pre>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)<\/p>/g, "$1");
  html = html.replace(/<p>(<blockquote>)/g, "$1");
  html = html.replace(/(<\/blockquote>)<\/p>/g, "$1");
  html = html.replace(/<p>(<hr>)<\/p>/g, "$1");
  html = html.replace(/<p>(<table>)/g, "$1");
  html = html.replace(/(<\/table>)<\/p>/g, "$1");

  return html;
}
