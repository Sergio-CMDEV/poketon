// Tema elegido (claro / oscuro) antes de pintar nada, para que no parpadee. Va en un archivo aparte (y no dentro
// de index.html) para que la política de seguridad (CSP) pueda prohibir los scripts metidos en la página.
try { if (localStorage.getItem('tema') === 'oscuro') document.documentElement.dataset.tema = 'oscuro'; } catch { /* sin almacenamiento */ }
