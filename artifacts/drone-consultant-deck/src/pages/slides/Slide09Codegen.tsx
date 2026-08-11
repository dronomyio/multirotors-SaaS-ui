export default function Slide09Codegen() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const bullet = (color: string, label: string, desc: string) => (
    <div style={{ display:"flex",alignItems:"flex-start",gap:"1vw" }}>
      <div style={{ width:"0.5vw",height:"0.5vw",borderRadius:"50%",backgroundColor:color,marginTop:"0.65vh",flexShrink:0 }} />
      <div>
        <span style={{ fontSize:"1vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5" }}>{label}</span>
        {desc && <span style={{ fontSize:"0.95vw",color:"#9AA5CE",marginLeft:"1vw" }}>— {desc}</span>}
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
          <div style={inactive}>POST /messages</div>
          <div style={inactive}>Database Schema</div>
          <div style={active}><span style={bar} />Codegen Pipeline</div>
          <div style={inactive}>Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" }}>
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Endpoints</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 3vh 0",letterSpacing:"-0.03em" }}>Codegen Pipeline</h1>

        {/* Pipeline diagram */}
        <div style={{ display:"flex",alignItems:"center",gap:"2vw",marginBottom:"4vh",padding:"2vh 2.5vw",backgroundColor:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"0.5vw" }}>
          <div style={{ padding:"1.2vh 2vw",backgroundColor:"rgba(224,175,104,0.12)",border:"1px solid rgba(224,175,104,0.3)",borderRadius:"0.4vw",fontFamily:"'DM Mono',monospace",fontSize:"1vw",color:"#E0AF68" }}>openapi.yaml</div>
          <div style={{ fontSize:"1.5vw",color:"#565F89" }}>→</div>
          <div style={{ padding:"1.2vh 2vw",backgroundColor:"rgba(122,162,247,0.12)",border:"1px solid rgba(122,162,247,0.3)",borderRadius:"0.4vw",fontFamily:"'DM Mono',monospace",fontSize:"1vw",color:"#7AA2F7" }}>Orval 8</div>
          <div style={{ fontSize:"1.5vw",color:"#565F89" }}>→</div>
          <div style={{ display:"flex",flexDirection:"column",gap:"1vh" }}>
            <div style={{ padding:"0.8vh 1.5vw",backgroundColor:"rgba(158,206,106,0.1)",border:"1px solid rgba(158,206,106,0.25)",borderRadius:"0.4vw",fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",color:"#9ECE6A" }}>lib/api-client-react</div>
            <div style={{ padding:"0.8vh 1.5vw",backgroundColor:"rgba(255,158,100,0.1)",border:"1px solid rgba(255,158,100,0.25)",borderRadius:"0.4vw",fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",color:"#FF9E64" }}>lib/api-zod</div>
          </div>
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:"2.5vh",flex:1 }}>
          {bullet("#E0AF68","lib/api-spec/openapi.yaml","source of truth for all endpoint shapes — 3.1 spec with custom DraftOrder schemas")}
          {bullet("#9ECE6A","lib/api-client-react","React Query hooks (useListOpenaiConversations, useCreateDraftOrder, getSendOpenaiMessageUrl…)")}
          {bullet("#FF9E64","lib/api-zod","Zod request/response validators used in Express routes")}
          {bullet("#7AA2F7","pnpm --filter @workspace/api-spec run codegen","runs Orval + tsc --build typecheck gate across all libs")}
          {bullet("#565F89","Zod v3 workaround","Orval 8 generates z.int() (v4 API) — all integer fields in spec use type: number instead")}
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>09</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
