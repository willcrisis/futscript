export const TEAM_NAMES = [
  'União FC', 'Real Bragança', 'Atlético do Vale', 'EC Litoral',
  'Nacional AC', 'Portuária FC', 'Ferroviário EC', 'Comercial FC',
  'Operário FC', 'Independência', 'Guarani do Norte', 'Estrela do Sul',
  'Marítimo FC', 'Alvorada EC', 'Cruzeiro do Oeste', 'Tupi da Serra',
]

const FIRST = [
  'Carlos', 'João', 'Pedro', 'Lucas', 'Rafael', 'Bruno', 'Diego', 'Thiago',
  'Marcos', 'Felipe', 'Gustavo', 'Eduardo', 'Ricardo', 'André', 'Paulo',
  'Sérgio', 'Fábio', 'Rodrigo', 'Leandro', 'Márcio', 'Vinícius', 'Igor',
  'Renato', 'Alex', 'Daniel', 'Everton', 'Wesley', 'Júlio', 'Caio', 'Otávio',
]

const LAST = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Almeida',
  'Ferreira', 'Rodrigues', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Barbosa',
  'Cardoso', 'Nascimento', 'Moreira', 'Carvalho', 'Teixeira', 'Rocha',
  'Dias', 'Monteiro', 'Mendes', 'Freitas', 'Ramos', 'Vieira', 'Nunes',
  'Moura', 'Cavalcanti', 'Batista',
]

export function randomName(rand: () => number): string {
  const first = FIRST[Math.floor(rand() * FIRST.length)]
  const last = LAST[Math.floor(rand() * LAST.length)]
  return `${first} ${last}`
}
