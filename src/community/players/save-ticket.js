// Capture the displayed ticket, including its current review result and event details.
export async function saveTicket(element, id) {
  if (!element) throw Error('票根尚未加载，请稍后再试。');
  await document.fonts.ready;
  const {width,height} = element.getBoundingClientRect();
  const copy = element.cloneNode(true);
  const qr = copy.querySelector('.registration-ticket-invite img');
  if (qr) {
    const response = await fetch(qr.src);
    if (!response.ok) throw Error('进群二维码未能载入，请重试。');
    const blob = await response.blob();
    qr.src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('进群二维码未能载入，请重试。'));
      reader.readAsDataURL(blob);
    });
  }
  const sourceNodes = [element,...element.querySelectorAll('*')];
  const targetNodes = [copy,...copy.querySelectorAll('*')];
  sourceNodes.forEach((source,index) => {
    const style = getComputedStyle(source);
    for (const property of style) targetNodes[index].style.setProperty(property,style.getPropertyValue(property));
  });
  Object.assign(copy.style,{margin:'0',width:width+'px',height:height+'px',boxShadow:'none'});
  copy.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`;
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width*2);canvas.height = Math.ceil(height*2);
  const context = canvas.getContext('2d');
  context.scale(2,2);context.drawImage(image,0,0,width,height);
  // Pseudo-elements are absent from the cloned DOM: recreate the tear-line cutouts.
  const y = element.querySelector('.registration-ticket-stub').getBoundingClientRect().top-element.getBoundingClientRect().top;
  context.globalCompositeOperation='destination-out';
  for (const x of [0,width]) {context.beginPath();context.arc(x,y,width>460?9.6:8,0,Math.PI*2);context.fill();}
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
  if (!blob) throw Error('保存失败，请重试。');
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;anchor.download = `零一玩家-票根-${id}.png`;
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
