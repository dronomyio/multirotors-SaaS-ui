export default function Slide06Shopify() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };
  const code: React.CSSProperties = { backgroundColor:"#16161E",borderRadius:"0.5vw",padding:"2vh 2vw",border:"1px solid rgba(255,255,255,0.05)",fontFamily:"'DM Mono',monospace",fontSize:"0.85vw",lineHeight:1.75 };
  const colHead: React.CSSProperties = { fontSize:"1.1vw",fontWeight:600,color:"#FFFFFF",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:"1vh",marginBottom:"2vh" };

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
        <div style={navGroup}><div style={active}><span style={bar} />Shopify</div></div>

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
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Integrations</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 1.5vh 0",letterSpacing:"-0.03em" }}>Shopify Integration</h1>
        <p style={{ fontSize:"1.1vw",color:"#9AA5CE",lineHeight:1.5,marginBottom:"3vh" }}>
          Two Shopify APIs — Storefront for search, Admin for checkout. Graceful degradation when credentials are absent.
        </p>

        <div style={{ display:"flex",gap:"4vw",flex:1 }}>
          {/* Storefront API */}
          <div style={{ flex:1,display:"flex",flexDirection:"column" }}>
            <div style={colHead}>
              <span style={{ padding:"0.3vh 0.8vw",backgroundColor:"rgba(158,206,106,0.15)",border:"1px solid rgba(158,206,106,0.3)",borderRadius:"0.3vw",fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",color:"#9ECE6A",marginRight:"1vw" }}>POST</span>
              Storefront API
            </div>
            <div style={code}>
              <div style={{color:"#565F89",marginBottom:"0.5vh"}}>// Product catalog search</div>
              <div><span style={{color:"#E0AF68"}}>const</span> <span style={{color:"#C0CAF5"}}>res = </span><span style={{color:"#E0AF68"}}>await</span> <span style={{color:"#7AA2F7"}}>fetch</span><span style={{color:"#C0CAF5"}}>(</span></div>
              <div style={{paddingLeft:"1.5vw",color:"#9ECE6A"}}>`https://${'{'}domain{'}'}/api/2024-10/graphql.json`<span style={{color:"#C0CAF5"}}>,</span></div>
              <div style={{paddingLeft:"1.5vw",color:"#C0CAF5"}}>{"{"} <span style={{color:"#7AA2F7"}}>method</span>: <span style={{color:"#9ECE6A"}}>'POST'</span>,</div>
              <div style={{paddingLeft:"3vw",color:"#C0CAF5"}}><span style={{color:"#7AA2F7"}}>headers</span>: {"{"}</div>
              <div style={{paddingLeft:"4.5vw",color:"#9ECE6A"}}>'X-Shopify-Storefront-Access-Token'</div>
              <div style={{paddingLeft:"4.5vw",color:"#565F89"}}>// from Replit Secret</div>
              <div style={{paddingLeft:"3vw",color:"#C0CAF5"}}>{"}"} {"})"}</div>
            </div>
            <div style={{ marginTop:"2vh",fontSize:"0.95vw",color:"#9AA5CE",lineHeight:1.5 }}>
              Query: <span style={{fontFamily:"'DM Mono',monospace",color:"#C0CAF5"}}>products(query, first: 6)</span> with priceRange, images, and variant IDs
            </div>
          </div>

          {/* Admin API */}
          <div style={{ flex:1,display:"flex",flexDirection:"column" }}>
            <div style={colHead}>
              <span style={{ padding:"0.3vh 0.8vw",backgroundColor:"rgba(122,162,247,0.15)",border:"1px solid rgba(122,162,247,0.3)",borderRadius:"0.3vw",fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",color:"#7AA2F7",marginRight:"1vw" }}>POST</span>
              Admin API via Connector
            </div>
            <div style={code}>
              <div style={{color:"#565F89",marginBottom:"0.5vh"}}>// Draft Order — no Admin token in secrets</div>
              <div><span style={{color:"#E0AF68"}}>const</span> <span style={{color:"#C0CAF5"}}>connectors = </span><span style={{color:"#E0AF68"}}>new</span> <span style={{color:"#7AA2F7"}}>ReplitConnectors</span><span style={{color:"#C0CAF5"}}>();</span></div>
              <div style={{marginTop:"0.5vh"}}><span style={{color:"#E0AF68"}}>await</span> connectors.<span style={{color:"#7AA2F7"}}>proxy</span><span style={{color:"#C0CAF5"}}>(</span></div>
              <div style={{paddingLeft:"1.5vw",color:"#9ECE6A"}}>'shopify-store'<span style={{color:"#C0CAF5"}}>,</span></div>
              <div style={{paddingLeft:"1.5vw",color:"#9ECE6A"}}>`/admin/api/2024-10/draft_orders.json`<span style={{color:"#C0CAF5"}}>,</span></div>
              <div style={{paddingLeft:"1.5vw",color:"#C0CAF5"}}>{"{"} <span style={{color:"#7AA2F7"}}>method</span>: <span style={{color:"#9ECE6A"}}>'POST'</span>, <span style={{color:"#7AA2F7"}}>body</span>: payload {"}"}</div>
              <div style={{color:"#C0CAF5"}}>);</div>
            </div>
            <div style={{ marginTop:"2vh",fontSize:"0.95vw",color:"#9AA5CE",lineHeight:1.5 }}>
              In-store items use numeric <span style={{fontFamily:"'DM Mono',monospace",color:"#C0CAF5"}}>variant_id</span>. External items are custom line items with title + price.
            </div>
          </div>
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>06</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
