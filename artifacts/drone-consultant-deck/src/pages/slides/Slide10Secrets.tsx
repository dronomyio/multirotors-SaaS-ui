export default function Slide10Secrets() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const secret = (color: string, name: string, desc: string) => (
    <div style={{ display:"flex",alignItems:"center",gap:"2vw",padding:"1.5vh 2vw",backgroundColor:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:"0.5vw" }}>
      <div style={{ width:"0.7vw",height:"0.7vw",borderRadius:"50%",backgroundColor:color,flexShrink:0 }} />
      <div style={{ fontSize:"0.95vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5",minWidth:"26vw" }}>{name}</div>
      <div style={{ fontSize:"0.95vw",color:"#9AA5CE",flex:1 }}>{desc}</div>
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
          <div style={inactive}>Codegen Pipeline</div>
          <div style={active}><span style={bar} />Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main */}
      <div style={{ flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" }}>
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Configuration</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 1.2vh 0",letterSpacing:"-0.03em" }}>Secrets &amp; Configuration</h1>
        <p style={{ fontSize:"1.1vw",color:"#9AA5CE",lineHeight:1.5,marginBottom:"3.5vh" }}>
          All credentials stored as Replit Secrets — never in code, never in <span style={{fontFamily:"'DM Mono',monospace",color:"#C0CAF5"}}>.env</span> files. Shopify Admin auth via Replit connector — no Admin token in secrets.
        </p>

        <div style={{ display:"flex",flexDirection:"column",gap:"1.5vh",flex:1 }}>
          {secret("#7AA2F7","AI_INTEGRATIONS_OPENAI_BASE_URL","Replit-managed OpenAI proxy base URL — no user API key needed")}
          {secret("#7AA2F7","AI_INTEGRATIONS_OPENAI_API_KEY","Replit-managed key, billed to Replit credits")}
          {secret("#9ECE6A","SHOPIFY_STORE_DOMAIN","e.g. mystore.myshopify.com — used for Storefront API calls")}
          {secret("#9ECE6A","SHOPIFY_STOREFRONT_ACCESS_TOKEN","Public-facing Storefront API token for product search")}
          {secret("#E0AF68","TAVILY_API_KEY","External web search API — used when products are not in the Shopify catalog")}
          {secret("#FF9E64","SESSION_SECRET","Express session secret")}
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"auto" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>10</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
