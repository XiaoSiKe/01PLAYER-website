import { useMemo } from 'react';
import { FiLink } from 'react-icons/fi';
import Markdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';


const headingPrefix = 'guide-heading-';
const headingPlugins = [[rehypeSlug, { prefix: headingPrefix }]];

export function readArticle(id, source) {
  return source ?? {};
}

export function findArticleHeading(fragment) {
  try {
    return document.getElementById(headingPrefix + decodeURIComponent(fragment));
  } catch {
    return null;
  }
}

export function GuideHeading({ as: Heading, id, href, children }) {
  return <div className="guide-heading">
    <Heading id={id} tabIndex={-1}>{children}</Heading>
    <a className="guide-heading-link" href={href} aria-label="本标题的链接">
      <FiLink aria-hidden="true" />
    </a>
  </div>;
}

export function GuideMarkdown({ chapterId, body }) {
  const components = useMemo(() => {
    const renderHeading = ({ node, id, children }) => {
      const fragment = id.slice(headingPrefix.length);
      return <GuideHeading as={node.tagName} id={id} href={`#${chapterId}/${encodeURIComponent(fragment)}`}>
        {children}
      </GuideHeading>;
    };
    return {
      h1: renderHeading, h2: renderHeading, h3: renderHeading,
      h4: renderHeading, h5: renderHeading, h6: renderHeading,
      a({ node, href, children, ...props }) {
        const destination = href?.startsWith('#') ? `#${chapterId}/${href.slice(1)}` : href;
        return <a href={destination} {...props}>{children}</a>;
      },
    };
  }, [chapterId]);

  return <div className="guide-markdown">
    <Markdown components={components} rehypePlugins={headingPlugins} skipHtml>{body}</Markdown>
  </div>;
}
