export default function Slide03ChatSSE() {
  const inactive: React.CSSProperties = { fontSize:"1vw",color:"#C0CAF5",opacity:0.6 };
  const active: React.CSSProperties = { fontSize:"1vw",color:"#7AA2F7",fontWeight:500,display:"flex",alignItems:"center",gap:"0.5vw" };
  const bar: React.CSSProperties = { width:"4px",height:"1.2vw",backgroundColor:"#7AA2F7",borderRadius:"2px",marginLeft:"-3vw",flexShrink:0 };
  const secHead: React.CSSProperties = { fontSize:"0.85vw",fontWeight:600,color:"#565F89",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"1.5vh" };
  const navGroup: React.CSSProperties = { display:"flex",flexDirection:"column",gap:"1.2vh",marginBottom:"2.5vh" };

  const bullet = (text: string, sub?: string) => (
    <div style={{ display:"flex",alignItems:"flex-start",gap:"1vw" }}>
      <div style={{ width:"0.5vw",height:"0.5vw",borderRadius:"50%",backgroundColor:"#7AA2F7",marginTop:"0.65vh",flexShrink:0 }} />
      <div>
        <div style={{ fontSize:"1.05vw",color:"#C0CAF5",lineHeight:1.5 }}>{text}</div>
        {sub && <div style={{ fontSize:"0.95vw",color:"#9AA5CE",marginTop:"0.3vh" }}>{sub}</div>}
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
        <div style={navGroup}><div style={active}><span style={bar} />Chat UI &amp; SSE</div></div>

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
        <div style={{ fontSize:"1vw",color:"#7AA2F7",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,marginBottom:"1.5vh" }}>Frontend</div>
        <h1 style={{ fontSize:"4vw",fontWeight:800,color:"#FFFFFF",margin:"0 0 1.5vh 0",letterSpacing:"-0.03em" }}>Chat UI &amp; SSE Streaming</h1>
        <p style={{ fontSize:"1.2vw",color:"#9AA5CE",lineHeight:1.6,maxWidth:"48vw",margin:"0 0 3.5vh 0" }}>
          Dark aerospace interface built with wouter, shadcn/ui, and Tailwind. Pure SSE — no WebSocket, no Socket.io.
        </p>

        <div style={{ display:"flex",gap:"5vw",flex:1 }}>
          {/* Bullets left */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",gap:"2.5vh" }}>
            {bullet("/chat route", "Wouter, shadcn/ui, Tailwind — mission-control aesthetic")}
            {bullet("Conversation sidebar", "List, create, delete via React Query hooks from Orval codegen")}
            {bullet("Native fetch() POST", "Opens ReadableStream — no EventSource library needed")}
            {bullet("Three SSE event types", "Decoded line-by-line from the raw byte stream")}
            {bullet("Status events", "Tool progress shown live: Searching catalog… Calculating pricing…")}
          </div>

          {/* Code right */}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"1.1vw",fontWeight:600,color:"#FFFFFF",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:"1vh",marginBottom:"2vh" }}>
              SSE Decoder Loop
            </div>
            <div style={{ backgroundColor:"#16161E",borderRadius:"0.5vw",padding:"2vh 2vw",border:"1px solid rgba(255,255,255,0.05)",fontFamily:"'DM Mono',monospace",fontSize:"0.9vw",lineHeight:1.75 }}>
              <div style={{color:"#7AA2F7"}}>for <span style={{color:"#C0CAF5"}}>(</span><span style={{color:"#E0AF68"}}>const</span><span style={{color:"#C0CAF5"}}> line of chunk.split(</span><span style={{color:"#9ECE6A"}}>'\n'</span><span style={{color:"#C0CAF5"}}>) {"{"}</span></div>
              <div style={{paddingLeft:"2vw",color:"#C0CAF5"}}><span style={{color:"#E0AF68"}}>if</span> (!line.startsWith(<span style={{color:"#9ECE6A"}}>'data: '</span>)) <span style={{color:"#E0AF68"}}>continue</span>;</div>
              <div style={{paddingLeft:"2vw",color:"#C0CAF5"}}><span style={{color:"#E0AF68"}}>const</span> p = JSON.parse(line.slice(<span style={{color:"#FF9E64"}}>6</span>));</div>
              <div style={{paddingLeft:"2vw",marginTop:"0.5vh",color:"#E0AF68"}}>if (p.type === <span style={{color:"#9ECE6A"}}>'text'</span>{")"} <span style={{color:"#565F89"}}>→ append chunk</span></div>
              <div style={{paddingLeft:"2vw",color:"#E0AF68"}}>if (p.type === <span style={{color:"#9ECE6A"}}>'composition'</span>{")"} <span style={{color:"#565F89"}}>→ render invoice</span></div>
              <div style={{paddingLeft:"2vw",color:"#E0AF68"}}>if (p.type === <span style={{color:"#9ECE6A"}}>'status'</span>{")"} <span style={{color:"#565F89"}}>→ show tool status</span></div>
              <div style={{paddingLeft:"2vw",color:"#E0AF68"}}>if (p.type === <span style={{color:"#9ECE6A"}}>'done'</span>{")"} <span style={{color:"#565F89"}}>→ refetch conversation</span></div>
              <div style={{color:"#C0CAF5"}}>{"}"}</div>
            </div>
          </div>
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:"1vw",color:"#565F89",fontWeight:500 }}>03</span>
          <span style={{ fontSize:"0.9vw",color:"#565F89" }}>multirotors.store · Internal</span>
        </div>
      </div>
    </div>
  );
}
