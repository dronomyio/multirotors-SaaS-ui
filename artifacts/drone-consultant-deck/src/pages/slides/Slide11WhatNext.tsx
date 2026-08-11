export default function Slide11WhatNext() {
  const card = (color: string, num: string, title: string, desc: string) => (
    <div style={{ flex:1,padding:"4vh 3vw",backgroundColor:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"0.8vw",display:"flex",flexDirection:"column",gap:"2vh",borderTop:`3px solid ${color}` }}>
      <div style={{ width:"3vw",height:"3vw",borderRadius:"50%",backgroundColor:`${color}18`,border:`1.5px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <span style={{ fontSize:"1.3vw",fontWeight:700,color,fontFamily:"'DM Mono',monospace" }}>{num}</span>
      </div>
      <div style={{ fontSize:"1.3vw",fontWeight:700,color:"#FFFFFF",lineHeight:1.3 }}>{title}</div>
      <div style={{ fontSize:"1.05vw",color:"#9AA5CE",lineHeight:1.6,flex:1 }}>{desc}</div>
    </div>
  );

  return (
    <div style={{ width:"100vw",height:"100vh",overflow:"hidden",backgroundColor:"#1A1B26",fontFamily:"'Inter',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",color:"#C0CAF5" }}>
      {/* Radial gradient */}
      <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at center, rgba(122,162,247,0.12) 0%, transparent 65%)",pointerEvents:"none" }} />

      {/* Logo mark */}
      <div style={{ width:"4vw",height:"4vw",backgroundColor:"#7AA2F7",borderRadius:"1vw",marginBottom:"4vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:1 }}>
        <div style={{ width:"2vw",height:"2vw",backgroundColor:"#1A1B26",borderRadius:"0.5vw" }} />
      </div>

      <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:"2vh",position:"relative",zIndex:1 }}>Roadmap</div>

      <h1 style={{ fontSize:"5vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 4vh 0",letterSpacing:"-0.03em",position:"relative",zIndex:1 }}>What's Next</h1>

      <div style={{ display:"flex",gap:"3vw",maxWidth:"70vw",width:"100%",position:"relative",zIndex:1 }}>
        {card("#7AA2F7","1","End-to-End Test","Verify streaming, invoice render, and Shopify checkout with live catalog data. Confirm status events display correctly and invoice history replays from messages.metadata.")}
        {card("#9ECE6A","2","Invoice History","Re-render past invoices when a conversation is reopened — messages.metadata (jsonb) already stores the Invoice object. Frontend needs to hydrate InvoiceCard from it.")}
        {card("#E0AF68","3","Mobile Companion","Expo React Native app for field operators and procurement teams. Same API server, same SSE streaming endpoint — drone consultant in the pocket.")}
      </div>

      <div style={{ position:"absolute",bottom:"5vh",left:"8vw",right:"8vw",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>11</div>
        <div style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</div>
      </div>
    </div>
  );
}
