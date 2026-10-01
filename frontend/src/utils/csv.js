// Celda CSV segura. Los textos que empiezan con = + - @ (o tab/enter) los
// interpreta Excel como fórmulas; como el nombre y el equipo los escriben los
// clientes, se les antepone ' para que se muestren como texto.
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
