export default function Hero() {
  return <section className="hero" id="inicio">
    <img
      className="hero-media"
      src="/images/home/hero-estrella-real-estate.jpeg"
      alt="Vista premium de propiedad en Santiago para Estrella Real Estate"
      width="1200"
      height="1600"
      fetchPriority="high"
    />
    <div className="container">
      <div className="hero-content">
        <span className="eyebrow">Estrella Real Estate · Santiago</span>
        <h1>Tu próximo capítulo comienza aquí.</h1>
        <p>Propiedades seleccionadas en las mejores zonas de República Dominicana para vivir, invertir y construir patrimonio.</p>
        <div className="hero-actions">
          <a className="button light" href="#propiedades">Ver propiedades</a>
          <a className="button outline" href="#contacto">Contáctanos</a>
        </div>
      </div>
    </div>
  </section>;
}
