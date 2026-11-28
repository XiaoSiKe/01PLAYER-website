// CMS groups are the website's complete guide content. Ordering comes from the editor.
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reserved = ['overview', 'reading', 'skill', 'guide-content'];
export function validateGuide(rows) {
  try {
    if (!Array.isArray(rows) || rows.length > 100) throw Error('攻略最多可添加 100 个目录。');
    const ids = new Set(reserved);
    let count = 0, bytes = 0;
    function id(value, group = false) {
      if (typeof value !== 'string' || value.length > 64 || !identifier.test(value) || ids.has(value) || (group && !value.startsWith('reading-')))
        throw Error('攻略目录或文章的固定标识无效或重复。');
      ids.add(value);
    }
    function text(value, max, name, required = false) {
      if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error(name + '未填写或超出长度限制。');
    }
    for (const group of rows) {
      if (!group || typeof group !== 'object') throw Error('目录格式无效。');
      id(group.id, true); text(group.title, 120, '目录标题', true);
      if (!Array.isArray(group.chapters)) throw Error('文章列表格式无效。');
      for (const article of group.chapters) {
        if (!article || typeof article !== 'object') throw Error('文章格式无效。');
        id(article.id); text(article.title, 120, '文章标题', true);
        text(article.body, 128 * 1024, 'Markdown 正文');
        for (const key of ['author', 'university']) text(article[key], 120, key === 'author' ? '作者' : '作者大学');
        text(article.uploadedAt, 10, '上传日期');
        if (article.uploadedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(article.uploadedAt) || !Number.isFinite(Date.parse(article.uploadedAt)) || new Date(article.uploadedAt).toISOString().slice(0, 10) !== article.uploadedAt))
          throw Error('请选择有效的上传日期。');
        const length = new TextEncoder().encode(article.body).length;
        bytes += length; count++;
        if (length > 128 * 1024 || bytes > 6 * 1024 * 1024 || count > 100) throw Error('攻略最多 100 篇文章，每篇正文最多 128 KB，总正文最多 6 MB。');
      }
    }
    return true;
  } catch (error) { return error.message; }
}
export function guideContent(rows) {
  const valid = validateGuide(rows);
  if (valid !== true) throw Error(valid);
  return {
    groups: rows.map(({ id, title, chapters }) => ({ id, title, chapters: chapters.map(({ id, title }) => ({ id, title })) })),
    articles: Object.fromEntries(rows.flatMap(group => group.chapters.map(({ id, title, body, author, university, uploadedAt }) =>
      [id, { title, body, author, university, uploadedAt }]))),
  };
}
