export default function Slide01Title() {
  const s = {
    root: { width:"100vw",height:"100vh",overflow:"hidden",backgroundColor:"#1A1B26",fontFamily:"'Inter',sans-serif",display:"flex",color:"#C0CAF5",position:"relative" } as const,
    sidebar: { width:"22vw",height:"100vh",borderRight:"1px solid rgba(255,255,255,0.05)",padding:"5vh 3vw",display:"flex",flexDirection:"column" } as const,
    logo: { display:"flex",alignItems:"center",gap:"1vw",marginBottom:"5vh" } as const,
    logoBox: { width:"1.5vw",height:"1.5vw",backgroundColor:"#7AA2F7",borderRadius:"0.3vw" } as const,
    logoText: { fontSize:"1.2vw",fontWeight:600,color:"#FFFFFF" } as const,
    secHead: { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase" as const,letterSpacing:"0.05em",marginBottom:"1.5vh" },
    navGroup: { display:"flex",flexDirection:"column" as const,gap:"1.2vh",marginBottom:"2.5vh" },
    active: { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" } as const,
    inactive: { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 } as const,
    bar: { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 } as const,
    main: { flex:1,padding:"7vh 5vw 4vh",display:"flex",flexDirection:"column" as const,position:"relative" as const },
    label: { fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase" as const,letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" },
    h1: { fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 0.5vh 0",letterSpacing:"-0.03em" },
    h2: { fontSize:"2.4vw",fontWeight:600,color:"#7AA2F7",margin:"0 0 2.5vh 0",letterSpacing:"-0.02em" },
    sub: { fontSize:"1.2vw",color:"#9AA5CE",lineHeight:1.6,maxWidth:"44vw",margin:"0 0 3.5vh 0" },
    endpointBox: { display:"flex",alignItems:"center",padding:"1.2vh 2vw",backgroundColor:"rgba(122,162,247,0.1)",border:"1px solid rgba(122,162,247,0.25)",borderRadius:"0.5vw",marginBottom:"4vh",width:"fit-content" } as const,
    method: { fontSize:"1.1vw",fontWeight:700,color:"#7AA2F7",marginRight:"1.5vw",fontFamily:"'DM Mono',monospace" },
    path: { fontSize:"1.1vw",color:"#FFFFFF",fontFamily:"'DM Mono',monospace" },
    colHead: { fontSize:"1.1vw",fontWeight:600,color:"#FFFFFF",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:"1vh",marginBottom:"2vh" },
    code: { backgroundColor:"#16161E",borderRadius:"0.5vw",padding:"2vh 2vw",border:"1px solid rgba(255,255,255,0.05)",fontFamily:"'DM Mono',monospace",fontSize:"0.95vw",lineHeight:1.8 } as const,
    foot: { marginTop:"auto",display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%" } as const,
    footNum: { fontSize:"1vw",color:"#565F89",fontWeight:500 },
    footLabel: { fontSize:"0.9vw",color:"#565F89" },
  };

  return (
    <div style={s.root}>
      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoBox} />
          <div style={s.logoText}>multirotors</div>
        </div>

        <div style={s.secHead}>Overview</div>
        <div style={s.navGroup}>
          <div style={s.active}><span style={s.bar} />multirotors.store</div>
          <div style={s.inactive}>Architecture</div>
        </div>

        <div style={s.secHead}>Frontend</div>
        <div style={s.navGroup}>
          <div style={s.inactive}>Chat UI &amp; SSE</div>
        </div>

        <div style={s.secHead}>Agent</div>
        <div style={s.navGroup}>
          <div style={s.inactive}>Tool Chain</div>
          <div style={s.inactive}>Invoice Composer</div>
        </div>

        <div style={s.secHead}>Integrations</div>
        <div style={s.navGroup}>
          <div style={s.inactive}>Shopify</div>
        </div>

        <div style={s.secHead}>Endpoints</div>
        <div style={{ display:"flex",flexDirection:"column",gap:"1.2vh" }}>
          <div style={s.inactive}>POST /messages</div>
          <div style={s.inactive}>Database Schema</div>
          <div style={s.inactive}>Codegen Pipeline</div>
          <div style={s.inactive}>Secrets &amp; Config</div>
        </div>

        <div style={{ marginTop:"auto",fontSize:"0.8vw",color:"#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* ── Main ── */}
      <div style={s.main}>
        <div style={s.label}>Technical Overview</div>

        <h1 style={s.h1}>multirotors.store</h1>
        <h2 style={s.h2}>AI Drone Consultant</h2>

        <p style={s.sub}>
          An AI-powered sales assistant that searches live inventory, queries the web for external products, and generates a purchasable pro-forma invoice — all in a single streaming chat turn.
        </p>

        <div style={s.endpointBox}>
          <span style={s.method}>POST</span>
          <span style={s.path}>/api/openai/conversations/<span style={{color:"#E0AF68"}}>{"{"}</span><span style={{color:"#E0AF68"}}>id</span><span style={{color:"#E0AF68"}}>{"}"}</span>/messages</span>
        </div>

        <div style={{ display:"flex",gap:"4vw",flex:1 }}>
          {/* SSE stream */}
          <div style={{ flex:1 }}>
            <div style={s.colHead}>SSE Stream Events</div>
            <div style={s.code}>
              <div style={{color:"#565F89",marginBottom:"0.5vh"}}>// 1. text arrives progressively</div>
              <div><span style={{color:"#7AA2F7"}}>"type"</span><span style={{color:"#C0CAF5"}}>: </span><span style={{color:"#9ECE6A"}}>"text"</span><span style={{color:"#C0CAF5"}}>,  </span><span style={{color:"#7AA2F7"}}>"content"</span><span style={{color:"#C0CAF5"}}>: "..."</span></div>
              <div style={{color:"#565F89",margin:"1vh 0 0.5vh"}}>// 2. invoice card triggers</div>
              <div><span style={{color:"#7AA2F7"}}>"type"</span><span style={{color:"#C0CAF5"}}>: </span><span style={{color:"#9ECE6A"}}>"composition"</span><span style={{color:"#C0CAF5"}}>,  </span><span style={{color:"#7AA2F7"}}>"data"</span><span style={{color:"#C0CAF5"}}>: {"{"}&hellip;{"}"}</span></div>
              <div style={{color:"#565F89",margin:"1vh 0 0.5vh"}}>// 3. stream complete</div>
              <div><span style={{color:"#7AA2F7"}}>"type"</span><span style={{color:"#C0CAF5"}}>: </span><span style={{color:"#9ECE6A"}}>"done"</span></div>
            </div>
          </div>

          {/* Agent tools */}
          <div style={{ flex:1 }}>
            <div style={s.colHead}>Agent Tools</div>
            <div style={{ display:"flex",flexDirection:"column",gap:"2vh" }}>
              <div style={{ display:"flex",alignItems:"center",gap:"1vw" }}>
                <div style={{ width:"0.6vw",height:"0.6vw",backgroundColor:"#7AA2F7",borderRadius:"50%",flexShrink:0 }} />
                <div style={{ fontSize:"1vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5" }}>searchShopifyCatalog</div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:"1vw" }}>
                <div style={{ width:"0.6vw",height:"0.6vw",backgroundColor:"#9ECE6A",borderRadius:"50%",flexShrink:0 }} />
                <div style={{ fontSize:"1vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5" }}>searchExternalWeb</div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:"1vw" }}>
                <div style={{ width:"0.6vw",height:"0.6vw",backgroundColor:"#E0AF68",borderRadius:"50%",flexShrink:0 }} />
                <div style={{ fontSize:"1vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5" }}>calculateQuoteMetadata</div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:"1vw" }}>
                <div style={{ width:"0.6vw",height:"0.6vw",backgroundColor:"#FF9E64",borderRadius:"50%",flexShrink:0 }} />
                <div style={{ fontSize:"1vw",fontFamily:"'DM Mono',monospace",color:"#C0CAF5" }}>generateProFormaInvoice</div>
              </div>
            </div>
          </div>
        </div>

        <div style={s.foot}>
          <span style={s.footNum}>01</span>
          <span style={s.footLabel}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
