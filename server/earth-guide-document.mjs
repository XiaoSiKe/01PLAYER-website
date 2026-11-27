export function parseGuideArticle(source) {
  const metadata = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const fields = Object.fromEntries(Array.from(
    (metadata?.[1] ?? '').matchAll(/^(title|order|author|university|uploadedAt):[ \t]*(.*)$/gm),
    ([, key, value]) => [key, value.trim().replace(/^(['"])(.*)\1$/, '$2')],
  ));
  const body = source.slice(metadata?.[0].length ?? 0).trim();
  const firstHeading = body.match(/^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*(?:\r?\n|$)/);
  const title = fields.title || firstHeading?.[1];
  return {
    title,
    body: firstHeading && firstHeading[1] === title ? body.slice(firstHeading[0].length).trimStart() : body,
    order: fields.order?.match(/^\d{1,6}$/) ? Number(fields.order) : Infinity,
    author: fields.author,
    university: fields.university,
    uploadedAt: fields.uploadedAt?.match(/^\d{4}-\d{2}-\d{2}$/)?.[0],
  };
}
