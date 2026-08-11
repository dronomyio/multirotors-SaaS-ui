export default function Slide08Database() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };
  const code: React.CSSProperties = { backgroundColor:"#16161E",borderRadius:"0.5vw",padding:"1.8vh 2vw",border:"1px solid rgba(255,255,255,0.05)",fontFamily:"'DM Mono',monospace",fontSize:"0.88vw",lineHeight:1.65 };

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
          <div style={active}><span style={bar} />Database Schema</div>
          <div style={inactive}>Codegen Pipeline</div>
          <div style={inactive}>Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" }}>
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Endpoints</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 1.5vh 0",letterSpacing:"-0.03em" }}>Database Schema</h1>
        <p style={{ fontSize:"1.1vw",color:"#9AA5CE",lineHeight:1.5,marginBottom:"3vh" }}>
          Drizzle ORM on Postgres. Schema pushed with <span style={{fontFamily:"'DM Mono',monospace",color:"#C0CAF5"}}>drizzle-kit push</span>. Cascade delete keeps conversations and messages in sync.
        </p>

        <div style={{ display:"flex",gap:"4vw",flex:1 }}>
          {/* conversations */}
          <div style={{ flex:1,display:"flex",flexDirection:"column" }}>
            <div style={{ fontSize:"1.1vw",fontWeight:600,color:"#FFFFFF",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:"1vh",marginBottom:"2vh" }}>
              conversations
            </div>
            <div style={code}>
              <div><span style={{color:"#7AA2F7"}}>id</span>          <span style={{color:"#E0AF68"}}>SERIAL</span> <span style={{color:"#9ECE6A"}}>PRIMARY KEY</span></div>
              <div><span style={{color:"#7AA2F7"}}>title</span>       <span style={{color:"#E0AF68"}}>TEXT</span> <span style={{color:"#9ECE6A"}}>NOT NULL</span></div>
              <div><span style={{color:"#7AA2F7"}}>created_at</span>  <span style={{color:"#E0AF68"}}>TIMESTAMPTZ</span> <span style={{color:"#9ECE6A"}}>DEFAULT NOW()</span></div>
            </div>
          </div>

          {/* messages */}
          <div style={{ flex:1.4,display:"flex",flexDirection:"column" }}>
            <div style={{ fontSize:"1.1vw",fontWeight:600,color:"#FFFFFF",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:"1vh",marginBottom:"2vh" }}>
              messages
            </div>
            <div style={code}>
              <div><span style={{color:"#7AA2F7"}}>id</span>               <span style={{color:"#E0AF68"}}>SERIAL</span> <span style={{color:"#9ECE6A"}}>PRIMARY KEY</span></div>
              <div><span style={{color:"#7AA2F7"}}>conversation_id</span>  <span style={{color:"#E0AF68"}}>INTEGER</span> <span style={{color:"#9ECE6A"}}>REFERENCES</span> conversations</div>
              <div style={{paddingLeft:"2vw",color:"#565F89"}}>ON DELETE CASCADE</div>
              <div><span style={{color:"#7AA2F7"}}>role</span>             <span style={{color:"#E0AF68"}}>TEXT</span> <span style={{color:"#9ECE6A"}}>NOT NULL</span>        <span style={{color:"#565F89"}}>-- user | assistant</span></div>
              <div><span style={{color:"#7AA2F7"}}>content</span>          <span style={{color:"#E0AF68"}}>TEXT</span> <span style={{color:"#9ECE6A"}}>NOT NULL</span></div>
              <div><span style={{color:"#7AA2F7"}}>metadata</span>         <span style={{color:"#E0AF68"}}>JSONB</span>              <span style={{color:"#565F89"}}>-- Invoice object</span></div>
              <div><span style={{color:"#7AA2F7"}}>created_at</span>       <span style={{color:"#E0AF68"}}>TIMESTAMPTZ</span> <span style={{color:"#9ECE6A"}}>DEFAULT NOW()</span></div>
            </div>
          </div>
        </div>

        <div style={{ marginTop:"2.5vh",display:"flex",gap:"3vw" }}>
          <div style={{ display:"flex",alignItems:"center",gap:"0.8vw" }}>
            <div style={{ width:"0.6vw",height:"0.6vw",backgroundColor:"#9ECE6A",borderRadius:"50%" }} />
            <span style={{ fontSize:"0.95vw",color:"#9AA5CE" }}>ORM: Drizzle · <span style={{fontFamily:"'DM Mono',monospace",color:"#C0CAF5"}}>lib/db</span></span>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:"0.8vw" }}>
            <div style={{ width:"0.6vw",height:"0.6vw",backgroundColor:"#E0AF68",borderRadius:"50%" }} />
            <span style={{ fontSize:"0.95vw",color:"#9AA5CE" }}>API contract: OpenAPI 3.1 → Orval → React Query hooks + Zod validators</span>
          </div>
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"auto" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>08</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
