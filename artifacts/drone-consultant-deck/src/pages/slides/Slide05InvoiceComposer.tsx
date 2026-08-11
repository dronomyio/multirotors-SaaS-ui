export default function Slide05InvoiceComposer() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const bullet = (color: string, text: string) => (
    <div style={{ display:"flex",alignItems:"flex-start",gap:"1vw" }}>
      <div style={{ width:"0.5vw",height:"0.5vw",borderRadius:"50%",backgroundColor:color,marginTop:"0.65vh",flexShrink:0 }} />
      <div style={{ fontSize:"1.05vw",color:"#C0CAF5",lineHeight:1.5 }}>{text}</div>
    </div>
  );

  return (
    <div style={{ width:"100vw",height:"100vh",overflow:"hidden",backgroundColor:"#1A1B26",fontFamily:"'Inter',sans-serif",display:"flex",color:"#C0CAF5" }}>
      {/* Sidebar */}
      <div style={{ width:"22vw",height:"100vh",borderRight:"1px solid rgba(255,255,255,0.05)",padding:"5vh 3vw",display:"flex",flexDirection:"column" }}>
        <div style={{ display:"flex",alignItems:"center",gap:"1vw",marginBottom:"5vh" }}>
          <div style={{ width:"1.5vw",height:"1.5vw",backgroundColor:"#7AA2F7",borderRadius:"0.3vw" }} />
          <div style={{ fontSize:"1.2vw",fontWeight:600,color:"#FFFFFF" }}>multirotors</div>
        </div>

        <div style={secHead}>Overview</div>
        <div style={navGroup}>
          <div style={inactive}>multirotors.store</div>
          <div style={inactive}>Architecture</div>
        </div>

        <div style={secHead}>Frontend</div>
        <div style={navGroup}><div style={inactive}>Chat UI &amp; SSE</div></div>

        <div style={secHead}>Agent</div>
        <div style={navGroup}>
          <div style={inactive}>Tool Chain</div>
          <div style={active}><span style={bar} />Invoice Composer</div>
        </div>

        <div style={secHead}>Integrations</div>
        <div style={navGroup}><div style={inactive}>Shopify</div></div>

        <div style={secHead}>Endpoints</div>
        <div style={{ display:"flex",flexDirection:"column",gap:"1.2vh" }}>
          <div style={inactive}>POST /messages</div>
          <div style={inactive}>Database Schema</div>
          <div style={inactive}>Codegen Pipeline</div>
          <div style={inactive}>Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" }}>
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Agent</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 1.5vh 0",letterSpacing:"-0.03em" }}>Invoice Composer</h1>

        <div style={{ display:"flex",gap:"5vw",flex:1 }}>
          {/* Left: how invoice is built */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",gap:"2.2vh" }}>
            <p style={{ fontSize:"1.1vw",color:"#9AA5CE",lineHeight:1.5,margin:"0 0 1.5vh 0" }}>
              InvoiceCard renders inline in chat when a composition SSE event arrives.
            </p>
            {bullet("#7AA2F7","Itemized table: thumbnail, item name, IN STOCK / EXTERNAL badge, unit price, qty, line total")}
            {bullet("#9ECE6A","Summary block: Subtotal · Tax (8.5%) · Shipping · TOTAL")}
            {bullet("#E0AF68","Delivery estimate: 4 days in-store, 7 days for mixed/external bundles")}
            {bullet("#FF9E64","Invoice JSON saved to messages.metadata (jsonb) for history replay on revisit")}
            {bullet("#7AA2F7","Buy Now → POST /draft-order → opens Shopify checkout URL in a new tab")}
          </div>

          {/* Right: extraction pattern */}
          <div style={{ flex:1,display:"flex",flexDirection:"column" }}>
            <div style={{ fontSize:"1.1vw",fontWeight:600,color:"#FFFFFF",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:"1vh",marginBottom:"2vh" }}>
              Invoice Extraction Pattern
            </div>
            <div style={{ backgroundColor:"#16161E",borderRadius:"0.5vw",padding:"2vh 2vw",border:"1px solid rgba(255,255,255,0.05)",fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",lineHeight:1.7,marginBottom:"2vh" }}>
              <div style={{color:"#565F89"}}>// Agent appends to response text:</div>
              <div style={{color:"#9ECE6A",marginTop:"0.5vh"}}>__INVOICE__</div>
              <div style={{color:"#C0CAF5"}}>{"{"}<span style={{color:"#7AA2F7"}}>"items"</span>: [...],</div>
              <div style={{paddingLeft:"1vw",color:"#C0CAF5"}}><span style={{color:"#7AA2F7"}}>"subtotal"</span>: <span style={{color:"#FF9E64"}}>4850</span>,</div>
              <div style={{paddingLeft:"1vw",color:"#C0CAF5"}}><span style={{color:"#7AA2F7"}}>"tax"</span>: <span style={{color:"#FF9E64"}}>412.25</span>, <span style={{color:"#7AA2F7"}}>"total"</span>: <span style={{color:"#FF9E64"}}>5262.25</span>{"}"}</div>
              <div style={{color:"#9ECE6A"}}>__INVOICE__</div>
            </div>
            <div style={{ backgroundColor:"rgba(158,206,106,0.08)",border:"1px solid rgba(158,206,106,0.2)",borderRadius:"0.5vw",padding:"1.5vh 2vw" }}>
              <div style={{ fontSize:"0.9vw",color:"#9ECE6A",fontFamily:"'DM Mono',monospace",marginBottom:"0.5vh" }}>regex extract</div>
              <div style={{ fontSize:"0.9vw",color:"#9AA5CE" }}>Server splits text from JSON block, streams prose first, then emits the composition event</div>
            </div>
          </div>
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>05</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
