import {Footer,Header,ShowreelHero,VideoCoverFlow} from "./components";

const capabilities=[
  ["01","Brand & commercial film","Campaign films, product stories and branded content made to hold attention.","/services"],
  ["02","Social content systems","Repeatable reels, photography and creative direction built for consistent growth.","/services"],
  ["03","Photography","Editorial, hospitality, product, people and property imagery with a premium point of view.","/services"],
  ["04","Music videos","Artist-led concepts, production and post that turn a track into a visual world.","/services"],
];

const gallery=[
  ["/asset/showcase/still-01.jpg","Architectural Courtyard","Real estate"],
  ["/asset/showcase/still-03.jpg","Luxury Residence","Real estate"],
  ["/asset/showcase/still-04.jpg","Modern Forest Home","Real estate"],
  ["/asset/showcase/still-07.jpg","Stone Estate","Real estate"],
  ["/asset/showcase/still-05.jpg","Interior Collection","Real estate"],
  ["/asset/showcase/still-08.jpg","Contemporary Interiors","Real estate"],
  ["/asset/showcase/still-10.jpg","City Living","Real estate"],
  ["/asset/showcase/still-02.jpg","Chef at Work","Culinary"],
  ["/asset/showcase/still-06.jpg","Finishing Touch","Culinary"],
  ["/asset/showcase/still-09.png","Plated in Motion","Culinary"],
];

export default function Home(){return <main id="top" className="vv-home-v2"><Header/>
  <ShowreelHero/>
  <section className="vv-intro"><div className="vv-eyebrow"><span>Vancouver · Canada</span><span>Independent creative studio</span></div><div className="vv-intro-grid"><p>We plan, shoot and finish high-impact film, content and photography for brands, businesses and artists.</p><h2>VISUALS PEOPLE<br/>DON’T <i>SCROLL PAST.</i></h2></div><a className="vv-arrow-link" href="/about">Meet Velora Vista <b>↗</b></a></section>
  <VideoCoverFlow/>
  <section className="vv-industries" aria-label="Current portfolio categories"><span>Current collection</span><div><b>Real estate</b><b>Culinary</b><b>Photography</b><b>Short-form film</b></div></section>
  <section className="vv-property-gallery"><div className="vv-section-head"><div><span>02 / Photography portfolio</span><h2>Places and plates,<br/>framed with intention.</h2></div><p>A focused collection of real estate and culinary photography. More categories can be added as the portfolio grows.</p></div><div className="gallery-category-head"><span>Real estate</span><b>07 photographs</b></div><div className="vv-gallery-grid">{gallery.slice(0,7).map(([src,alt,category],i)=><figure className={`vv-gallery-image gallery-image-${i+1}`} key={src}><img src={src} alt={alt}/><figcaption><span>{String(i+1).padStart(2,"0")}</span><span>{category} · {alt}</span></figcaption></figure>)}</div><div className="gallery-category-head culinary"><span>Culinary</span><b>03 photographs</b></div><div className="culinary-gallery">{gallery.slice(7).map(([src,alt,category],i)=><figure className="vv-gallery-image" key={src}><img src={src} alt={alt}/><figcaption><span>{String(i+1).padStart(2,"0")}</span><span>{category} · {alt}</span></figcaption></figure>)}</div><div className="vv-gallery-foot"><span>Real estate · Culinary · Film</span><a href="/work">Explore the full portfolio ↗</a></div></section>
  <section className="vv-capabilities vv-capabilities-text"><div className="vv-section-head"><div><span>03 / What we make</span><h2>One studio.<br/>Every frame.</h2></div><p>From the first idea to the final export, one invested team keeps the work clear, consistent and unmistakably yours.</p></div><div className="vv-cap-grid">{capabilities.map(c=><a href={c[3]} key={c[1]}><span>{c[0]}</span><h3>{c[1]}</h3><p>{c[2]}</p><b>Explore ↗</b></a>)}</div></section>
  <section className="vv-proof"><div><span>Why Velora</span><h2>SMALL TEAM.<br/><i>FULL ATTENTION.</i></h2></div><div className="vv-proof-list"><article><b>01</b><h3>Direct collaboration</h3><p>You work with the people making the work—not layers of account management.</p></article><article><b>02</b><h3>Built for every channel</h3><p>One production can become campaign films, reels, stills and platform-ready cutdowns.</p></article><article><b>03</b><h3>Clear from start to finish</h3><p>Planning, production, delivery and revisions stay organized in your client portal.</p></article></div></section>
  <section className="vv-process"><div className="vv-section-head light"><div><span>04 / Our process</span><h2>Simple on purpose.</h2></div></div><div><article><span>01</span><h3>Discover</h3><p>We learn the goal, audience, offer and what needs to change after people watch.</p></article><article><span>02</span><h3>Build</h3><p>We shape the concept, treatment, schedule and production plan around your reality.</p></article><article><span>03</span><h3>Create</h3><p>We shoot with a focused crew, then edit, colour, sound-design and refine.</p></article><article><span>04</span><h3>Launch</h3><p>Final assets arrive organized and ready for the channels that matter.</p></article></div></section>
  <section className="vv-book"><img src="/asset/showcase/still-03.jpg" alt="Luxury residence exterior"/><div><span>Have a project in mind?</span><h2>LET’S MAKE THE<br/>NEXT ONE <i>COUNT.</i></h2><div><a href="/start-project">Start a project ↗</a><a href="tel:+17788200485">Call 778 820 0485</a></div></div></section>
  <Footer/>
</main>}
