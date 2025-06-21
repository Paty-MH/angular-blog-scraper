const puppeteer = require('puppeteer');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const XLSX = require('xlsx');

async function obtenerArticulos() {
  const navegador = await puppeteer.launch({ headless: false });
  const pagina = await navegador.newPage();

  await pagina.goto('https://blog.angular.dev/', { waitUntil: 'networkidle2', timeout: 0 });
  await pagina.waitForTimeout?.(8000) ?? new Promise(r => setTimeout(r, 8000));

  const articulos = await pagina.evaluate(() => {
    return Array.from(document.querySelectorAll('article')).map(articulo => {
      const titulo = articulo.querySelector('h2')?.innerText || 'Sin título';
      const texto = articulo.querySelector('p')?.innerText || '';
      const avatar = articulo.querySelector('img')?.src || null;
      const enlace = articulo.querySelector('a')?.href || null;
      return { titulo, texto, avatar, enlace };
    });
  });

  const resultados = [];

  for (const art of articulos) {
    if (!art.enlace) {
      resultados.push({
        ...art,
        fecha: 'No disponible',
        claps: "0",
        comentarios: "0",
        autor: { nombre: 'Autor', apellido: 'desconocido', avatar: art.avatar },
      });
      continue;
    }

    const paginaArticulo = await navegador.newPage();

    try {
      await paginaArticulo.goto(art.enlace, { waitUntil: 'networkidle2', timeout: 0 });
      await paginaArticulo.waitForTimeout?.(6000) ?? new Promise(r => setTimeout(r, 6000));

      const datosArticulo = await paginaArticulo.evaluate(() => {
        const fecha = document.querySelector('time')?.innerText || 'Fecha no disponible';
        const autorCompleto = document.querySelector('meta[name="author"]')?.content || 'Autor desconocido';
        const [nombre, ...apellidoArr] = autorCompleto.split(' ');
        const apellido = apellidoArr.join(' ') || 'desconocido';

        let claps = "0";
        let comentarios = "0";

        try {
          const apolloState = window.__APOLLO_STATE__;
          const postKey = Object.keys(apolloState).find(k => k.startsWith('Post:'));
          const post = apolloState[postKey] || {};
          claps = post.clapCount?.toString() || "0";
          comentarios = post.postResponses?.count?.toString() || "0";
        } catch (e) {}

        return {
          fecha,
          claps,
          comentarios,
          autor: {
            nombre,
            apellido,
            avatar: document.querySelector('img')?.src || null
          }
        };
      });

      resultados.push({
        titulo: art.titulo,
        texto: art.texto,
        enlace: art.enlace,
        avatar: art.avatar,
        fecha: datosArticulo.fecha,
        claps: datosArticulo.claps,
        comentarios: datosArticulo.comentarios,
        autor: datosArticulo.autor,
      });

    } catch (error) {
      console.error('❌ Error al procesar', art.enlace, error);
      resultados.push({
        ...art,
        fecha: 'Error al cargar',
        claps: "0",
        comentarios: "0",
        autor: { nombre: 'Error', apellido: 'desconocido', avatar: art.avatar },
      });
    }

    await paginaArticulo.close();
  }

  console.log('✅ Artículos completos:');
  console.log(JSON.stringify(resultados, null, 2));

  // 📁 Guardar como JSON
  fs.writeFileSync('articulos_completos.json', JSON.stringify(resultados, null, 2));

  // 📁 Guardar como CSV
  const csvWriter = createCsvWriter({
    path: 'articulos_completos.csv',
    header: [
      { id: 'titulo', title: 'Título' },
      { id: 'texto', title: 'Texto' },
      { id: 'enlace', title: 'Enlace' },
      { id: 'avatar', title: 'Avatar' },
      { id: 'fecha', title: 'Fecha' },
      { id: 'claps', title: 'Claps' },
      { id: 'comentarios', title: 'Comentarios' },
      { id: 'autor_nombre', title: 'Autor Nombre' },
      { id: 'autor_apellido', title: 'Autor Apellido' },
      { id: 'autor_avatar', title: 'Autor Avatar' },
    ]
  });

  await csvWriter.writeRecords(resultados.map(item => ({
    ...item,
    autor_nombre: item.autor.nombre,
    autor_apellido: item.autor.apellido,
    autor_avatar: item.autor.avatar
  })));

  // 📁 Guardar como XLSX
  const datosParaXLSX = resultados.map(item => ({
    Título: item.titulo,
    Texto: item.texto,
    Enlace: item.enlace,
    Avatar: item.avatar,
    Fecha: item.fecha,
    Claps: item.claps,
    Comentarios: item.comentarios,
    'Autor Nombre': item.autor.nombre,
    'Autor Apellido': item.autor.apellido,
    'Autor Avatar': item.autor.avatar
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(datosParaXLSX);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Artículos');
  XLSX.writeFile(workbook, 'articulos_completos.xlsx');

  await navegador.close();
}

obtenerArticulos();
