const BOM = String.fromCharCode(0xfeff);

/** CSV no padrão RFC 4180 com separador `;` (Excel em pt-BR) ou `,`, detectado no cabeçalho. */
export function lerCsv(texto: string): string[][] {
  const semBom = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const primeiraLinha = semBom.slice(0, semBom.search(/\r?\n|$/));
  const separador = primeiraLinha.includes(';') ? ';' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let entreAspas = false;
  for (let i = 0; i < semBom.length; i++) {
    const c = semBom.charAt(i);
    if (entreAspas) {
      if (c === '"' && semBom.charAt(i + 1) === '"') {
        celula += '"';
        i++;
      } else if (c === '"') entreAspas = false;
      else celula += c;
    } else if (c === '"') entreAspas = true;
    else if (c === separador) {
      linha.push(celula);
      celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && semBom.charAt(i + 1) === '\n') i++;
      linhas.push([...linha, celula]);
      linha = [];
      celula = '';
    } else celula += c;
  }
  if (celula !== '' || linha.length > 0) linhas.push([...linha, celula]);
  return linhas.filter((l) => l.some((valor) => valor.trim() !== ''));
}
