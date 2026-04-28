export default function AuthBackground() {
  return (
    <div className="relative hidden lg:flex lg:w-3/5 flex-col justify-between p-12 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #020817 0%, #0a1628 50%, #0d1f3c 100%)' }}>

      {/* Animated SVG network */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 700 900" fill="none"
        xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0 }}>
        <style>{`
          @keyframes pulse1 { 0%,100%{r:6;opacity:1} 50%{r:14;opacity:0} }
          @keyframes pulse2 { 0%,100%{r:9;opacity:1} 50%{r:20;opacity:0} }
          @keyframes pulse3 { 0%,100%{r:12;opacity:1} 50%{r:26;opacity:0} }
          @keyframes fadeLabel { 0%,100%{opacity:0.2} 50%{opacity:0.6} }
          @keyframes packet1 { 0%{cx:120;cy:200} 33%{cx:340;cy:150} 66%{cx:560;cy:280} 100%{cx:120;cy:200} }
          @keyframes packet2 { 0%{cx:200;cy:500} 33%{cx:420;cy:380} 66%{cx:580;cy:480} 100%{cx:200;cy:500} }
          @keyframes packet3 { 0%{cx:80;cy:650} 33%{cx:300;cy:580} 66%{cx:500;cy:650} 100%{cx:80;cy:650} }
          @keyframes packet4 { 0%{cx:160;cy:320} 50%{cx:460;cy:240} 100%{cx:160;cy:320} }
          .p1{animation:pulse1 3s ease-in-out infinite}
          .p2{animation:pulse2 3.5s ease-in-out infinite}
          .p3{animation:pulse3 4s ease-in-out infinite}
          .lbl{animation:fadeLabel 4s ease-in-out infinite}
        `}</style>

        {/* Edges */}
        <line x1="120" y1="200" x2="340" y2="150" stroke="rgba(59,130,246,0.2)" strokeWidth="1"/>
        <line x1="120" y1="200" x2="300" y2="380" stroke="rgba(59,130,246,0.2)" strokeWidth="1"/>
        <line x1="200" y1="500" x2="340" y2="150" stroke="rgba(59,130,246,0.15)" strokeWidth="1"/>
        <line x1="200" y1="500" x2="420" y2="380" stroke="rgba(59,130,246,0.2)" strokeWidth="1"/>
        <line x1="80"  y1="650" x2="300" y2="580" stroke="rgba(59,130,246,0.15)" strokeWidth="1"/>
        <line x1="160" y1="320" x2="340" y2="150" stroke="rgba(59,130,246,0.15)" strokeWidth="1"/>
        <line x1="340" y1="150" x2="560" y2="280" stroke="rgba(16,185,129,0.25)" strokeWidth="1.5"/>
        <line x1="420" y1="380" x2="560" y2="280" stroke="rgba(16,185,129,0.2)" strokeWidth="1.5"/>
        <line x1="300" y1="580" x2="500" y2="480" stroke="rgba(16,185,129,0.2)" strokeWidth="1.5"/>
        <line x1="560" y1="280" x2="620" y2="500" stroke="rgba(245,158,11,0.3)" strokeWidth="2"/>
        <line x1="500" y1="480" x2="620" y2="500" stroke="rgba(245,158,11,0.25)" strokeWidth="2"/>
        <line x1="580" y1="680" x2="620" y2="500" stroke="rgba(245,158,11,0.2)" strokeWidth="2"/>

        {/* Supplier nodes (blue, small) */}
        {[
          [120,200,0], [200,500,0.8], [80,650,1.6], [160,320,2.4], [240,720,3.2]
        ].map(([cx,cy,delay],i) => (
          <g key={`s${i}`}>
            <circle cx={cx} cy={cy} r="6" fill="#3b82f6" style={{filter:'drop-shadow(0 0 6px #3b82f6)'}}/>
            <circle cx={cx} cy={cy} r="6" fill="none" stroke="#3b82f6" strokeWidth="1.5"
              className="p1" style={{animationDelay:`${delay}s`,transformOrigin:`${cx}px ${cy}px`}}/>
          </g>
        ))}

        {/* Buyer nodes (green, medium) */}
        {[
          [340,150,0.5], [420,380,1.3], [300,580,2.1]
        ].map(([cx,cy,delay],i) => (
          <g key={`b${i}`}>
            <circle cx={cx} cy={cy} r="9" fill="#10b981" style={{filter:'drop-shadow(0 0 8px #10b981)'}}/>
            <circle cx={cx} cy={cy} r="9" fill="none" stroke="#10b981" strokeWidth="1.5"
              className="p2" style={{animationDelay:`${delay}s`,transformOrigin:`${cx}px ${cy}px`}}/>
          </g>
        ))}

        {/* Financier nodes (amber, large) */}
        {[
          [560,280,1.0], [620,500,2.0], [500,480,0.3], [580,680,1.5]
        ].map(([cx,cy,delay],i) => (
          <g key={`f${i}`}>
            <circle cx={cx} cy={cy} r="12" fill="#f59e0b" style={{filter:'drop-shadow(0 0 10px #f59e0b)'}}/>
            <circle cx={cx} cy={cy} r="12" fill="none" stroke="#f59e0b" strokeWidth="1.5"
              className="p3" style={{animationDelay:`${delay}s`,transformOrigin:`${cx}px ${cy}px`}}/>
          </g>
        ))}

        {/* Floating metric labels */}
        <text x="350" y="130" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace"
          className="lbl" style={{animationDelay:'0s'}}>₹2.4Cr</text>
        <text x="430" y="360" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace"
          className="lbl" style={{animationDelay:'1.5s'}}>R0: 1.2</text>
        <text x="570" y="260" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace"
          className="lbl" style={{animationDelay:'0.8s'}}>Risk: 72</text>
        <text x="90" y="640" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace"
          className="lbl" style={{animationDelay:'2.2s'}}>₹85L</text>

        {/* Data packets */}
        <circle r="3" fill="#60a5fa" opacity="0.9">
          <animate attributeName="cx" values="120;340;560;120" dur="4s" repeatCount="indefinite"/>
          <animate attributeName="cy" values="200;150;280;200" dur="4s" repeatCount="indefinite"/>
        </circle>
        <circle r="3" fill="#60a5fa" opacity="0.9">
          <animate attributeName="cx" values="200;420;580;200" dur="5s" repeatCount="indefinite"/>
          <animate attributeName="cy" values="500;380;480;500" dur="5s" repeatCount="indefinite"/>
        </circle>
        <circle r="3" fill="#34d399" opacity="0.9">
          <animate attributeName="cx" values="80;300;500;80" dur="6s" repeatCount="indefinite"/>
          <animate attributeName="cy" values="650;580;480;650" dur="6s" repeatCount="indefinite"/>
        </circle>
        <circle r="3" fill="#fbbf24" opacity="0.9">
          <animate attributeName="cx" values="160;460;620;160" dur="4.5s" repeatCount="indefinite"/>
          <animate attributeName="cy" values="320;240;500;320" dur="4.5s" repeatCount="indefinite"/>
        </circle>
      </svg>

      {/* Content above SVG */}
      <div className="relative z-10">
        <p className="font-sans font-extrabold tracking-tight"
          style={{ color: '#3b82f6', fontSize: 28, letterSpacing: '-0.02em' }}>
          NetCredix — Liquidity Orchestrator
        </p>
        <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)', maxWidth: 320 }}>
          Real-time liquidity intelligence for SME supply chains
        </p>
      </div>

      <div className="relative z-10">
        <div className="flex gap-3 flex-wrap">
          {['₹2,400Cr+ Protected', '1,200+ Suppliers', '99.2% Uptime'].map(stat => (
            <span key={stat} className="text-xs px-3 py-1.5 rounded-full font-mono"
              style={{
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#93c5fd'
              }}>
              {stat}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
