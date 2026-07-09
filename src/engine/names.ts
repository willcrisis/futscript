export const TEAM_NAMES = [
  'União FC', 'Real Bragança', 'Atlético do Vale', 'EC Litoral',
  'Nacional AC', 'Portuária FC', 'Ferroviário EC', 'Comercial FC',
  'Operário FC', 'Independência', 'Guarani do Norte', 'Estrela do Sul',
  'Marítimo FC', 'Alvorada EC', 'Cruzeiro do Oeste', 'Tupi da Serra',
  'Águia Dourada', 'Botafogo da Colina', 'Sereno FC', 'AA Cachoeira',
  'Primavera EC', 'Vila Rica FC', 'Horizonte AC', 'Pantanal EC',
  'Costa Azul FC', 'Mineração EC', 'Bandeirante FC', 'Sete Lagoas AC',
  'Fronteira EC', 'Palmares FC', 'Cabo Verde AC', 'Riacho Grande',
  'Imperial FC', 'Catarinense EC', 'Boa Vista AC', 'Diamante Negro',
  'São Rafael FC', 'Amazônia EC', 'Cerrado FC', 'Litorânea AC',
  'Vale Verde EC', 'Piratininga FC', 'Aurora do Leste', 'Granja Real',
  'Serra Azul FC', 'Baía Formosa', 'Rio Manso EC', 'Lagoa Dourada',
  'Vitória do Cerrado', 'Grêmio Serrano', 'Náutico do Vale', 'Esperança FC',
  'União Barrense', 'Atlético Ipê', 'Rio Verde EC', 'Sport Colinas',
  'Guará AC', 'Flor do Campo', 'Cristal FC', 'Ypê Amarelo EC',
  'Anhanguera FC', 'Tocantins AC', 'Real Palmeira', 'Brava Costa FC',
  'Sol Nascente EC', 'Monte Belo AC', 'Vale do Aço FC', 'Jacarandá EC',
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
