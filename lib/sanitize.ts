// Client-side HTML sanitization utility
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side fallback: strip all HTML tags
    return html.replace(/<[^>]*>/g, '');
  }
  
  // Client-side: use native browser APIs for safe HTML sanitization
  const allowedTags = ['span', 'div', 'b', 'i', 'strong', 'em'];
  const allowedClasses = ['text-emerald-400', 'text-amber-300', 'text-emerald-200'];
  
  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Remove any scripts or dangerous elements
  const scripts = temp.querySelectorAll('script, iframe, object, embed, link, style');
  scripts.forEach(el => el.remove());
  
  // Clean attributes - only allow specific classes
  const elements = temp.querySelectorAll('*');
  elements.forEach(el => {
    // Remove all attributes except class
    const attrs = Array.from(el.attributes);
    attrs.forEach(attr => {
      if (attr.name !== 'class') {
        el.removeAttribute(attr.name);
      }
    });
    
    // Validate class values
    if (el.className) {
      const classes = el.className.split(' ').filter(cls => allowedClasses.includes(cls));
      el.className = classes.join(' ');
    }
    
    // Remove elements with disallowed tag names
    if (!allowedTags.includes(el.tagName.toLowerCase())) {
      el.replaceWith(...Array.from(el.childNodes));
    }
  });
  
  return temp.innerHTML;
}