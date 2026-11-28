export default function MobileLineBreak({ children, after }) {
  const text = String(children);
  const match = text.match(after);
  if (!match) return children;
  const end = match.index + match[0].length;
  const punctuation = /^[、，,]/.test(text.slice(end)) ? text[end] : '';
  return <>{text.slice(0, end)}<span className="home-mobile-punctuation">{punctuation}</span><br className="home-mobile-break" /><span className="home-mobile-rest">{text.slice(end + punctuation.length)}</span></>;
}
