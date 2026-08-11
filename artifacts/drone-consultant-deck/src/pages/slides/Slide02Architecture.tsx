export default function Slide02Architecture() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const dot = (color: string) => (
    <div style={{ width:"0.7vw",height:"0.7vw",borderRadius:"50%",backgroundColor:color,marginTop:"0.5vh",flexShrink:0 }} />
  );

  const item = (color: string, name: string, desc: string) => (
    <div style={{ display:"flex",alignItems:"flex-start",gap:"1vw" }}>
      {dot(color)}
      <div>
        <div style={{ fontSize:"1vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5",marginBottom:"0.4vh" }}>{name}</div>
        <div style={{ fontSize:"0.95vw",color:"#9AA5CE",lineHeight:1.4 }}>{desc}</div>
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
          <div style={active}><span style={bar} />Architecture</div>
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
          <div style={inactive}>Codegen Pipeline</div>
          <div style={inactive}>Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" }}>
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Overview</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 1.5vh 0",letterSpacing:"-0.03em" }}>System Architecture</h1>
        <p style={{ fontSize:"1.2vw",color:"#9AA5CE",lineHeight:1.6,maxWidth:"48vw",margin:"0 0 4vh 0" }}>
          Seven services working together — React frontend, Express API, OpenAI agent, two Shopify APIs, Tavily search, and Postgres.
        </p>

        <div style={{ display:"flex",gap:"5vw",flex:1 }}>
          {/* Left column */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",gap:"2.8vh" }}>
            {item("#7AA2F7","artifacts/multirotors-store","React + Vite storefront — dark aerospace landing page + /chat route")}
            {item("#9ECE6A","artifacts/api-server","Express API — agent orchestration, SSE streaming, all REST routes")}
            {item("#E0AF68","OpenAI gpt-5.6-terra","Function-calling agent via Replit AI Integrations proxy (reasoning_effort: none)")}
            {item("#FF9E64","Shopify Storefront API","Product catalog search via GraphQL · 2024-10 API version")}
          </div>

          {/* Right column */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",gap:"2.8vh" }}>
            {item("#7AA2F7","Shopify Admin API","Draft Order creation via Replit connector proxy — no Admin token in secrets")}
            {item("#9ECE6A","Tavily","External web search scoped to retail domains for off-catalog products")}
            {item("#E0AF68","Postgres + Drizzle ORM","Conversations + messages with jsonb metadata for invoice persistence")}
          </div>
        </div>

        <div style={{ marginTop:"auto",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>02</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
