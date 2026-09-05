"use client";

import { type CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { AuthForm } from "./auth-form";

export function SiteMusic(){
  const [on,setOn]=useState(false),[ready,setReady]=useState(false);
  const audio=useRef<HTMLAudioElement | null>(null);
  useEffect(()=>{setReady(true);const player=audio.current;if(!player)return;player.volume=.42;const wanted=localStorage.getItem("velora-sound")==="on";if(wanted)void player.play().then(()=>setOn(true)).catch(()=>setOn(false));},[]);
  const toggle=async()=>{const player=audio.current;if(!player)return;if(on){player.pause();setOn(false);localStorage.setItem("velora-sound","off")}else{try{await player.play();setOn(true);localStorage.setItem("velora-sound","on")}catch{setOn(false);localStorage.setItem("velora-sound","off")}}};
  useEffect(()=>{const pauseForMedia=(e:Event)=>{const video=e.target as HTMLVideoElement;if(!video.muted&&on){audio.current?.pause();setOn(false);localStorage.setItem("velora-sound","off")}};document.querySelectorAll("video").forEach(v=>v.addEventListener("volumechange",pauseForMedia));return()=>document.querySelectorAll("video").forEach(v=>v.removeEventListener("volumechange",pauseForMedia))},[on]);
  if(!ready)return null;
  return <><audio ref={audio} src="/asset/audio/velora-soundtrack.mp3" preload="auto" loop onPlay={()=>setOn(true)} onPause={()=>setOn(false)}/><button className={`site-sound ${on?"is-on":""}`} onClick={toggle} aria-label={on?"Turn background music off":"Turn background music on"} aria-pressed={on}><span className="sound-bars" aria-hidden="true"><i/><i/><i/><i/></span><b>{on?"Sound on":"Sound off"}</b></button></>
}

export function ThemeToggle(){
  useEffect(()=>{const media=window.matchMedia("(prefers-color-scheme: dark)");const apply=()=>{document.documentElement.dataset.theme=media.matches?"dark":"light"};localStorage.removeItem("velora-theme");apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply)},[]);
  return null;
}

export function ShowreelHero(){
  const media=[
    ["image","/asset/showcase/addition-02.jpg","Estate exterior"],["image","/asset/showcase/addition-03.jpg","Chef plating"],["video","/asset/showcase/motion-01.mp4","Property film"],["image","/asset/showcase/addition-05.jpg","Production monitor"],["image","/asset/showcase/still-06.jpg","Culinary detail"],
    ["image","/asset/showcase/still-03.jpg","Luxury residence"],["video","/asset/showcase/motion-04.mp4","Culinary film"],["image","/asset/showcase/addition-08.jpg","Contemporary interior"],["image","/asset/showcase/addition-09.jpg","Production studio"],["image","/asset/showcase/still-09.png","Restaurant detail"],
    ["video","/asset/showcase/motion-02.mp4","Interior film"],["image","/asset/showcase/addition-06.jpg","Plated dish"],["image","/asset/showcase/still-04.jpg","Forest home"],["image","/asset/showcase/addition-01.jpg","Chef at work"],["image","/asset/showcase/still-08.jpg","Residence interior"],
    ["image","/asset/showcase/addition-04.jpg","Estate arrival"],["video","/asset/showcase/motion-05.mp4","Finishing touch"],["image","/asset/showcase/still-01.jpg","Architectural courtyard"],["image","/asset/showcase/addition-07.jpg","Culinary composition"],["video","/asset/showcase/motion-03.mp4","Property tour"],
    ["image","/asset/showcase/still-07.jpg","Stone estate"],["image","/asset/showcase/still-02.jpg","Chef portrait"],["image","/asset/showcase/still-10.jpg","City living"],["image","/asset/showcase/addition-10.jpg","Kitchen service"],["image","/asset/showcase/still-05.jpg","Interior collection"],
  ];
  const scenes=Array.from({length:5},(_,i)=>media.slice(i*5,i*5+5));
  const [active,setActive]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>setActive(v=>(v+1)%scenes.length),4600);return()=>window.clearInterval(timer)},[scenes.length]);
  return <section className="home-hero collage-hero"><div className="hero-collage" aria-live="off">{scenes.map((scene,sceneIndex)=><div className={`collage-scene ${sceneIndex===active?"active":""}`} aria-hidden={sceneIndex!==active} key={sceneIndex}>{scene.map(([type,src,alt],i)=><div className={`collage-tile tile-${i+1}`} key={src}>{type==="video"?<video autoPlay muted loop playsInline aria-label={alt}><source src={src} type="video/mp4"/></video>:<img src={src} alt={alt}/>}</div>)}</div>)}</div><div className="noise"/><div className="hero-kicker"><span>Film · Content · Photography</span><span>Vancouver / Available everywhere</span></div><h1>MAKE THEM<br/><i>FEEL</i> SOMETHING.</h1><a className="hero-cta" href="/start-project"><span>Start a project</span><b>↗</b></a><div className="hero-pagination" aria-label="Choose portfolio collage">{scenes.map((_,i)=><button className={i===active?"active":""} onClick={()=>setActive(i)} aria-label={`Show portfolio collage ${i+1}`} aria-pressed={i===active} key={i}><span/></button>)}</div></section>
}

const showcaseFilms=[
  {src:"/asset/showcase/motion-01.mp4",poster:"/asset/showcase/still-08.jpg",title:"Bright Listing Walkthrough",category:"Real estate"},
  {src:"/asset/showcase/motion-02.mp4",poster:"/asset/showcase/still-10.jpg",title:"Warm Interior Story",category:"Real estate"},
  {src:"/asset/showcase/motion-03.mp4",poster:"/asset/showcase/still-05.jpg",title:"Sunlit Property Tour",category:"Real estate"},
  {src:"/asset/showcase/motion-04.mp4",poster:"/asset/showcase/still-02.jpg",title:"Plated With Precision",category:"Culinary"},
  {src:"/asset/showcase/motion-05.mp4",poster:"/asset/showcase/still-06.jpg",title:"The Final Touch",category:"Culinary"},
];

export function VideoCoverFlow(){
  const [active,setActive]=useState(0),total=showcaseFilms.length;
  const move=(step:number)=>setActive(v=>(v+step+total)%total);
  const position=(index:number)=>{let d=index-active;if(d>total/2)d-=total;if(d<-total/2)d+=total;return d};
  return <section className="coverflow-section"><div className="vv-section-head light"><div><span>01 / Motion portfolio</span><h2>Stories in motion.</h2></div><p>Real estate and culinary films—move through the collection like an album library.</p></div><div className="coverflow-stage">{showcaseFilms.map((film,i)=>{const pos=position(i);return <button type="button" className={`coverflow-card ${pos===0?"active":""}`} style={{"--cover-pos":pos,"--cover-depth":10-Math.abs(pos)} as CSSProperties} onClick={()=>setActive(i)} aria-label={`View ${film.title}`} aria-pressed={pos===0} key={film.src}><video autoPlay={pos===0} muted loop playsInline poster={film.poster}><source src={film.src} type="video/mp4"/></video><span>{film.category}</span><b>{film.title}</b></button>})}</div><div className="coverflow-controls"><button onClick={()=>move(-1)} aria-label="Previous film">←</button><div><b>{String(active+1).padStart(2,"0")}</b><span>/ {String(total).padStart(2,"0")}</span></div><button onClick={()=>move(1)} aria-label="Next film">→</button></div><div className="coverflow-now"><span>Now showing</span><h3>{showcaseFilms[active].title}</h3><p>{showcaseFilms[active].category}</p></div></section>
}

export function BrandIntro(){
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    const seen=sessionStorage.getItem("velora-intro-seen");
    if(seen){setVisible(false);return}
    document.body.classList.add("intro-active");
    const timer=window.setTimeout(()=>{setVisible(false);document.body.classList.remove("intro-active");sessionStorage.setItem("velora-intro-seen","1")},2800);
    return()=>{window.clearTimeout(timer);document.body.classList.remove("intro-active")};
  },[]);
  if(!visible)return null;
  return <div className="brand-intro" aria-hidden="true"><div className="intro-panel intro-panel-a"/><div className="intro-panel intro-panel-b"/><div className="intro-mark"><img src="/asset/velora-logo-transparent.png" alt=""/><span>FILM&nbsp;&nbsp;•&nbsp;&nbsp;CONTENT&nbsp;&nbsp;•&nbsp;&nbsp;PHOTOGRAPHY</span></div><div className="intro-counter"><span>LOADING THE GOOD STUFF</span><b>00&nbsp;&nbsp;—&nbsp;&nbsp;100</b></div></div>
}

export function Logo({dark=false}:{dark?:boolean}) { return <a className={`logo ${dark?"logo-dark":""}`} href="/" aria-label="Velora Vista Visuals home"><img src="/asset/velora-logo-transparent.png" alt="Velora Vista Visuals" /></a> }

export function Header({dark=false}:{dark?:boolean}) {
  const [open,setOpen]=useState(false);
  return <>
    <header className={`site-header ${dark?"header-dark":""}`}>
      <Logo dark={dark}/>
      <p className="header-note">A visual production studio<br/>Vancouver, Canada</p>
      <nav className="desktop-nav"><a href="/work">Work</a><a href="/services">Services</a><a href="/about">Studio</a></nav>
      <div className="header-actions"><a className="login-link" href="/login">Client login</a><a className="start-link" href="/start-project">Start a project <b>↗</b></a></div>
      <button className="menu-btn" onClick={()=>setOpen(!open)} aria-expanded={open} aria-label="Toggle menu">{open?"Close":"Menu"}</button>
    </header>
    <div className={`mobile-menu ${open?"open":""}`}><Logo/><nav><a href="/work">Work <span>01</span></a><a href="/services">Services <span>02</span></a><a href="/about">Studio <span>03</span></a><a href="/start-project">Start a project <span>04</span></a><a href="/login">Client login <span>05</span></a></nav></div>
  </>;
}

export function Footer(){const phrase="LET’S MAKE SOMETHING PEOPLE REMEMBER ✦ ";return <footer className="mega-footer"><div className="ticker"><div className="ticker-track"><div>{phrase}{phrase}</div><div aria-hidden="true">{phrase}{phrase}</div></div></div><div className="footer-grid"><Logo/><div><p>New business</p><a href="mailto:info@veloravistavisuals.com">info@veloravistavisuals.com</a></div><div><p>Find us</p><a href="https://instagram.com/veloravista" target="_blank" rel="noreferrer">@veloravista</a><a href="tel:+17788200485">+1 778 820 0485</a></div><div><p>Based in</p><span>Vancouver, BC<br/>Working everywhere</span></div></div><div className="footer-bottom"><span>© 2026 Velora Vista Visuals Ltd.</span><a href="#top">Back to top ↑</a></div></footer>}

export function PageIntro({index,kicker,title,accent}:{index:string,kicker:string,title:string,accent?:string}){return <section className="page-intro"><span>{index}</span><p>{kicker}</p><h1>{title} {accent&&<em>{accent}</em>}</h1></section>}

export function CallbackForm(){
 const [sent,setSent]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget);const r=await fetch("/api/project-request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(f))});if(r.ok)setSent(true);else setError((await r.json()).error||"Please try again.");setBusy(false)}
 if(sent)return <div className="form-success"><span>✓</span><h2>We’ve got it.</h2><p>Someone from Velora Vista will call you within one business day.</p><button onClick={()=>setSent(false)}>Send another request</button></div>;
 return <form className="project-form" onSubmit={submit}><div className="form-row"><label>Your name<input required name="name" placeholder="First and last name"/></label><label>Company<input name="company" placeholder="Brand or business"/></label></div><div className="form-row"><label>Email<input required type="email" name="email" placeholder="you@company.com"/></label><label>Phone number<input required type="tel" name="phone" placeholder="+1 604 000 0000"/></label></div><label>What do you need?<select required name="service" defaultValue=""><option value="" disabled>Choose a service</option><option>Monthly social content</option><option>Commercial / brand film</option><option>Photography</option><option>Music video</option><option>Wedding film</option><option>One-time trial shoot</option></select></label><label>Tell us about the project<textarea name="details" placeholder="What are you making, and what should it achieve?" rows={5}/></label><label>Best time to call<select name="time"><option>Morning</option><option>Afternoon</option><option>Evening</option></select></label>{error&&<p role="alert">{error}</p>}<button className="submit-button" type="submit" disabled={busy}>{busy?"Sending…":"Request a callback"} <span>↗</span></button></form>
}

export function ClientLoginForm(){
  return <div className="portal-access-note"><p>Client accounts are created and approved by the Velora Vista team. Use the invited email address below.</p><AuthForm/><a href="mailto:info@veloravistavisuals.com?subject=Client%20portal%20access">Request portal access</a></div>
}

export function ClientPortal(){
 const [tab,setTab]=useState("overview"); const [payment,setPayment]=useState(false); const [notice,setNotice]=useState(3); const [notificationsOpen,setNotificationsOpen]=useState(false);
 const openNotice=(destination:string)=>{setTab(destination);setNotificationsOpen(false)};
 return <main className="portal"><aside className="portal-side"><Logo dark/><nav>{[["overview","Overview"],["projects","My work"],["billing","Billing & invoices"],["account","Account"]].map(([id,label])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{label}<span>↗</span></button>)}</nav><div className="portal-help"><p>Need help?</p><a href="tel:+17788200485">Call 778-820-0485</a><a href="mailto:info@veloravistavisuals.com">Email support</a></div><a className="sign-out" href="/login">Sign out</a></aside><section className="portal-main"><header><div><p>VELORA CLIENT PORTAL</p><h1>Good afternoon,<br/>Northline Realty.</h1></div><div className="notification-wrap"><button className="bell" onClick={()=>setNotificationsOpen(v=>!v)} aria-expanded={notificationsOpen} aria-label="Open notifications">♢ {notice>0&&<b>{notice}</b>}</button>{notificationsOpen&&<div className="notification-panel"><div className="notification-head"><div><small>CLIENT UPDATES</small><h2>Notifications</h2></div><button onClick={()=>setNotice(0)}>Mark all read</button></div><button className="notification-item" onClick={()=>openNotice("projects")}><span className={notice?"unread":""}/><div><b>Your latest property reel is ready</b><p>Final files were added to Google Drive.</p><small>2 hours ago</small></div><i>↗</i></button><button className="notification-item" onClick={()=>openNotice("billing")}><span className={notice?"unread":""}/><div><b>Invoice INV-2026-008 paid</b><p>Your August payment was received.</p><small>August 1, 2026</small></div><i>↗</i></button><button className="notification-item" onClick={()=>openNotice("overview")}><span className={notice?"unread":""}/><div><b>Next production day confirmed</b><p>Northline listing content is booked.</p><small>August 18 · 10:00 AM</small></div><i>↗</i></button></div>}</div></header>
 {tab==="overview"&&<><div className="portal-alert"><span>●</span><div><b>Your latest property reel is ready.</b><p>Final files were added 2 hours ago.</p></div><button onClick={()=>setTab("projects")}>View files ↗</button></div><div className="portal-grid"><article className="plan-card"><div><p>CURRENT PLAN</p><span className="status">● Active</span></div><h2>Momentum</h2><h3>$1,299 <span>/ month</span></h3><ul><li>10 short-form videos</li><li>1 focused production day</li><li>Creative direction & planning</li><li>Two revision rounds</li></ul><div className="plan-foot"><p>Next billing date<br/><b>September 1, 2026</b></p><a href="tel:+17788200485">Call to change or cancel ↗</a></div></article><article className="next-shoot"><p>NEXT SHOOT</p><div className="date-box"><b>18</b><span>AUG<br/>2026</span></div><h3>Northline listing content</h3><span>10:00 AM · Burnaby, BC</span><a href="mailto:info@veloravistavisuals.com?subject=Reschedule%20August%2018%20shoot">Request a change ↗</a></article></div><section className="recent-work"><div className="portal-title"><div><p>RECENT WORK</p><h2>Your latest deliveries</h2></div><button onClick={()=>setTab("projects")}>See all work ↗</button></div><div className="delivery-row"><video autoPlay muted loop playsInline poster="/asset/showcase/still-08.jpg"><source src="/asset/showcase/motion-01.mp4" type="video/mp4"/></video><div><b>July Property Content</b><p>8 reels · 42 photos</p></div><span className="ready">Ready</span><a href="https://drive.google.com/" target="_blank" rel="noreferrer">Open Drive ↗</a></div></section></>}
 {tab==="projects"&&<section className="portal-section"><div className="portal-title"><div><p>MY WORK</p><h2>Projects & deliverables</h2></div></div>{[["July Property Content","8 reels · 42 photos","Ready"],["June Listing Campaign","10 reels · 65 photos","Ready"],["August Content Day","Production scheduled","In progress"]].map((x,i)=><div className="file-project" key={x[0]}><span>0{i+1}</span><div><h3>{x[0]}</h3><p>{x[1]}</p></div><b>{x[2]}</b>{i<2?<a href="https://drive.google.com/" target="_blank" rel="noreferrer">Open Google Drive ↗</a>:<span>Expected Aug 25</span>}</div>)}</section>}
 {tab==="billing"&&<section className="portal-section"><div className="portal-title"><div><p>BILLING</p><h2>Payment & invoices</h2></div></div><div className="payment-card"><div><span>PAYMENT METHOD</span><b>VISA</b></div><h3>•••• •••• •••• 4242</h3><p>Expires 08/29 · Northline Realty</p><button onClick={()=>setPayment(true)}>Update card details ↗</button></div><div className="invoice-list"><div><b>Invoice</b><b>Date</b><b>Amount</b><b>Status</b><span>Document</span></div>{[["INV-2026-008","Aug 1, 2026","$1,299.00"],["INV-2026-007","Jul 1, 2026","$1,299.00"],["INV-2026-006","Jun 1, 2026","$1,299.00"]].map(x=><div key={x[0]}><span>{x[0]}</span><span>{x[1]}</span><span>{x[2]}</span><span className="paid">Paid</span><div className="invoice-actions"><a href={`/invoices/${x[0]}.pdf`} target="_blank" rel="noreferrer">View ↗</a><a href={`/invoices/${x[0]}.pdf`} download>Download ↓</a></div></div>)}</div><div className="cancel-note"><b>Plan changes and cancellations</b><p>For account security and to make sure nothing is missed, plans cannot be cancelled online. Please call our team at <a href="tel:+17788200485">778-820-0485</a>.</p></div></section>}
 {tab==="account"&&<section className="portal-section account-panel"><div className="portal-title"><div><p>ACCOUNT</p><h2>Company details</h2></div></div><label>Company name<input defaultValue="Northline Realty"/></label><label>Primary contact<input defaultValue="Alex Morgan"/></label><label>Email<input defaultValue="alex@northlinerealty.ca"/></label><label>Phone<input defaultValue="778 555 0192"/></label><button>Save changes</button></section>}
 </section>{payment&&<div className="portal-modal"><form onSubmit={e=>{e.preventDefault();setPayment(false)}}><button type="button" className="modal-close" onClick={()=>setPayment(false)}>Close ×</button><p>SECURE PAYMENT</p><h2>Update card</h2><label>Name on card<input required placeholder="Full name"/></label><label>Card number<input required inputMode="numeric" placeholder="1234 5678 9012 3456"/></label><div><label>Expiry<input required placeholder="MM / YY"/></label><label>CVC<input required placeholder="123"/></label></div><button type="submit">Save payment method ↗</button><small>Payment details are encrypted and securely processed.</small></form></div>}</main>
}
