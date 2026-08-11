export default function Slide07Endpoint() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const colors = ["#7AA2F7","#9ECE6A","#E0AF68","#FF9E64","#7AA2F7","#9ECE6A","#E0AF68","#FF9E64","#7AA2F7"];

  const step = (n: number, text: string, code?: string) => (
    <div style={{ display:"flex",alignItems:"flex-start",gap:"1.5vw" }}>
      <div style={{ width:"2.2vw",height:"2.2vw",borderRadius:"50%",backgroundColor:`${colors[n-1]}18`,border:`1.5px solid ${colors[n-1]}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
        <span style={{ fontSize:"0.9vw",fontWeight:700,color:colors[n-1],fontFamily:"'DM Mono',monospace" }}>{n}</span>
      </div>
      <div style={{ paddingTop:"0.3vh" }}>
        <span style={{ fontSize:"1vw",color:"#C0CAF5",lineHeight:1.5 }}>{text}</span>
        {code && <span style={{ fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",color:"#9AA5CE",marginLeft:"0.8vw" }}>{code}</span>}
      </div>
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
          <div style={inactive}>Invoice Composer</div>
        </div>

        <div style={secHead}>Integrations</div>
        <div style={navGroup}><div style={inactive}>Shopify</div></div>

        <div style={secHead}>Endpoints</div>
        <div style={{ display:"flex",flexDirection:"column",gap:"1.2vh" }}>
          <div style={active}><span style={bar} />POST /messages</div>
          <div style={inactive}>Database Schema</div>
          <div style={inactive}>Codegen Pipeline</div>
          <div style={inactive}>Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" }}>
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Endpoints</div>

        <div style={{ display:"flex",alignItems:"center",gap:"2vw",marginBottom:"3.5vh" }}>
          <h1 style={{ fontSize:"3.5vw",fontWeight:800,color:"#FFFFFF",margin:0,letterSpacing:"-0.03em" }}>Full SSE Endpoint Flow</h1>
          <div style={{ display:"flex",alignItems:"center",padding:"0.8vh 1.5vw",backgroundColor:"rgba(122,162,247,0.1)",border:"1px solid rgba(122,162,247,0.25)",borderRadius:"0.5vw" }}>
            <span style={{ fontSize:"0.95vw",fontWeight:700,color:"#7AA2F7",marginRight:"1vw",fontFamily:"'DM Mono',monospace" }}>POST</span>
            <span style={{ fontSize:"0.95vw",color:"#FFFFFF",fontFamily:"'DM Mono',monospace" }}>/conversations/<span style={{color:"#E0AF68"}}>{"{"}</span><span style={{color:"#E0AF68"}}>id</span><span style={{color:"#E0AF68"}}>{"}"}</span>/messages</span>
          </div>
        </div>

        <div style={{ display:"flex",gap:"4vw",flex:1 }}>
          <div style={{ flex:1,display:"flex",flexDirection:"column",gap:"1.8vh" }}>
            {step(1,"Validate conversationId + content body")}
            {step(2,"Emit immediate status event","→ 'Connecting to drone consultant…'")}
            {step(3,"Persist user message to Postgres")}
            {step(4,"Fetch full conversation history","→ ChatCompletionMessageParam[]")}
            {step(5,"Emit status","→ 'Analyzing your request…'")}
          </div>
          <div style={{ flex:1,display:"flex",flexDirection:"column",gap:"1.8vh" }}>
            {step(6,"runDroneAgent() — function-calling loop, tools emit status SSE mid-flight")}
            {step(7,"extractInvoice() — regex splits text from __INVOICE__ block")}
            {step(8,"Stream text in 4-char chunks","data: {\"type\":\"text\",…}")}
            {step(9,"Emit composition + persist to DB with metadata jsonb","→ done")}
          </div>
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>07</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
