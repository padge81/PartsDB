type ArrowCanvas = Pick<CanvasRenderingContext2D,'lineWidth'|'beginPath'|'moveTo'|'lineTo'|'stroke'|'closePath'|'fill'>;

/** Draw arrowheads at the endpoints in image coordinates, including reversed drags. */
export function drawRepairArrow(ctx:ArrowCanvas,x:number,y:number,x2:number,y2:number,doubleEnded:boolean) {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
  const angle=Math.atan2(y2-y,x2-x),length=ctx.lineWidth*5;
  const head=(tipX:number,tipY:number,direction:number)=>{
    ctx.beginPath();ctx.moveTo(tipX,tipY);
    ctx.lineTo(tipX-length*Math.cos(direction-.45),tipY-length*Math.sin(direction-.45));
    ctx.lineTo(tipX-length*Math.cos(direction+.45),tipY-length*Math.sin(direction+.45));
    ctx.closePath();ctx.fill();
  };
  head(x2,y2,angle);
  if(doubleEnded)head(x,y,angle+Math.PI);
}
