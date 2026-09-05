import {Footer,Header} from "../components";

const realEstateStills=["01","03","04","07","05","08","10","/asset/showcase/addition-02.jpg","/asset/showcase/addition-04.jpg","/asset/showcase/addition-08.jpg"];
const culinaryStills=["02","06","09","/asset/showcase/addition-01.jpg","/asset/showcase/addition-03.jpg","/asset/showcase/addition-06.jpg","/asset/showcase/addition-07.jpg","/asset/showcase/addition-10.jpg"];
const productionStills=["/asset/showcase/addition-05.jpg","/asset/showcase/addition-09.jpg"];
const films=[
  {slug:"bright-listing-walkthrough",title:"Bright Listing Walkthrough",category:"Real Estate",video:"/asset/showcase/motion-01.mp4",poster:"/asset/showcase/still-08.jpg"},
  {slug:"warm-interior-story",title:"Warm Interior Story",category:"Real Estate",video:"/asset/showcase/motion-02.mp4",poster:"/asset/showcase/still-10.jpg"},
  {slug:"sunlit-property-tour",title:"Sunlit Property Tour",category:"Real Estate",video:"/asset/showcase/motion-03.mp4",poster:"/asset/showcase/still-05.jpg"},
  {slug:"plated-with-precision",title:"Plated With Precision",category:"Culinary",video:"/asset/showcase/motion-04.mp4",poster:"/asset/showcase/still-02.jpg"},
  {slug:"the-final-touch",title:"The Final Touch",category:"Culinary",video:"/asset/showcase/motion-05.mp4",poster:"/asset/showcase/still-06.jpg"},
];

function Chapter({index,title,stills,filmList}:{index:string,title:string,stills:string[],filmList:typeof films}){return <section className="portfolio-chapter" id={title.toLowerCase().replaceAll(" ","-")}>
  <header><span>{index}</span><h2>{title}</h2><p>{stills.length.toString().padStart(2,"0")} photographs<br/>{filmList.length.toString().padStart(2,"0")} films</p></header>
  <div className={`portfolio-stills ${title==="Culinary"?"culinary":""}`}>{stills.map((n,i)=>{const src=n.startsWith("/")?n:`/asset/showcase/still-${n}.${n==="09"?"png":"jpg"}`;return <figure key={src}><img src={src} alt={`${title} portfolio photograph ${i+1}`}/><figcaption><span>{String(i+1).padStart(2,"0")}</span><span>{title} · Photography</span></figcaption></figure>})}</div>
  {filmList.length>0&&<><div className="portfolio-film-head"><span>Film</span><span>Selected motion work</span></div><div className="portfolio-films">{filmList.map((film,i)=><a href={`/work/${film.slug}`} key={film.slug}><video muted loop playsInline autoPlay poster={film.poster}><source src={film.video} type="video/mp4"/></video><div><span>{String(i+1).padStart(2,"0")} / {film.category}</span><h3>{film.title}</h3><b>View film ↗</b></div></a>)}</div></>}
</section>}

export default function Work(){return <main id="top" className="vv-public-v2 portfolio-page"><Header dark/>
  <section className="portfolio-intro"><div><span>01 / Selected portfolio</span><p>Vancouver · Canada</p></div><h1>REAL WORK.<br/><i>CLEARLY SORTED.</i></h1><div className="portfolio-index"><p>Only work from the current collection—organized by subject and medium.</p><nav><a href="#real-estate">Real Estate <b>↘</b></a><a href="#culinary">Culinary <b>↘</b></a><a href="#behind-the-scenes">Behind the Scenes <b>↘</b></a></nav></div></section>
  <Chapter index="01" title="Real Estate" stills={realEstateStills} filmList={films.filter(x=>x.category==="Real Estate")}/>
  <Chapter index="02" title="Culinary" stills={culinaryStills} filmList={films.filter(x=>x.category==="Culinary")}/>
  <Chapter index="03" title="Behind the Scenes" stills={productionStills} filmList={[]}/>
  <section className="work-cta"><p>Have something in mind?</p><a href="/start-project">Let’s make it real ↗</a></section><Footer/>
</main>}
