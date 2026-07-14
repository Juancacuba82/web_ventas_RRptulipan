const str = "No podemos enviarle la foto de la unidad exacta porque los depósitos portuarios están automatizados y las pilas se mueven constantemente por logística y seguridad. Sin embargo, aquí tiene fotos reales del rango de calidad que entregamos la semana pasada en su zona. Su unidad se verá exactamente dentro de este estándar de pintura, golpes menores y sellado.<br><br><a href='https://rpcontainer.com/#gallery' target='_blank' style='display:inline-block; padding:10px 20px; background-color:#c8102e; color:white; text-decoration:none; border-radius:20px; font-weight:bold;'>Galería</a>";
const regex = /<a\s+(?:[^>]*?\s+)?href=(['"])(.*?)\1[^>]*>(.*?)<\/a>/i;
const match = str.match(regex);
console.log(match ? match[2] : "No match");
