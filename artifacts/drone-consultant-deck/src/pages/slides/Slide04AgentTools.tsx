export default function Slide04AgentTools() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const tool = (color: string, name: string, source: string, desc: string) => (
    <div style={{ display:"flex",alignItems:"flex-start",gap:"2vw",padding:"2vh 2vw",backgroundColor:"rgba(255,255,255,0.02)",borderRadius:"0.5vw",border:"1px solid rgba(255,255,255,0.05)",borderLeft:`3px solid ${color}` }}>
      <div style={{ flex:1 }}>
        <div style={{ display:"flex",alignItems:"baseline",gap:"1.5vw",marginBottom:"0.5vh" }}>
          <span style={{ fontSize:"1.05vw",fontFamily:"'DM Mono',monospace",color:"#FFFFFF",fontWeight:500 }}>{name}</span>
          <span style={{ fontSize:"0.85vw",color:"#565F89" }}>{source}</span>
        </div>
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
          <div style={inactive}>Architecture</div>
        </div>

        <div style={secHead}>Frontend</div>
        <div style={navGroup}><div style={inactive}>Chat UI &amp; SSE</div></div>

        <div style={secHead}>Agent</div>
        <div style={navGroup}>
          <div style={active}><span style={bar} />Tool Chain</div>
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
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Agent</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 0.8vh 0",letterSpacing:"-0.03em" }}>Tool Chain</h1>
        <p style={{ fontSize:"1.1vw",color:"#9AA5CE",lineHeight:1.5,marginBottom:"3vh" }}>
          OpenAI function-calling loop · up to 8 iterations · <span style={{fontFamily:"'DM Mono',monospace",color:"#C0CAF5"}}>gpt-5.6-terra</span> via Replit AI proxy · <span style={{fontFamily:"'DM Mono',monospace",color:"#E0AF68"}}>reasoning_effort: "none"</span>
        </p>

        <div style={{ display:"flex",flexDirection:"column",gap:"1.8vh",flex:1 }}>
          {tool("#7AA2F7","searchShopifyCatalog","Storefront API","GraphQL query against /api/2024-10/graphql.json — returns up to 6 products with price, images, and variant IDs")}
          {tool("#9ECE6A","searchExternalWeb","Tavily","Search scoped to bhphotovideo, getfpv, amazon, bestbuy — returns title, URL, and estimated price")}
          {tool("#E0AF68","calculateQuoteMetadata","server-side math","8.5% tax · free shipping over $500 · 4 days in-store / 7 days mixed delivery estimate")}
          {tool("#FF9E64","generateProFormaInvoice","pass-through","Structures the final invoice object — passed as the composition SSE event after the text response")}
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>04</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
