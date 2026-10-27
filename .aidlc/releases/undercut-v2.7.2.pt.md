# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2: três correções ao Pick Team vindas das escolhas para o México — o seletor reserva o fecho mais barato para que um piloto nunca te deixe sem construtor, as tuas escolhas guardam-se antes de a equipa estar completa, e a dica do Pit Wall é uma linha destacada em vez de um distintivo por cima dos números.

## Corrigido

- **Um piloto que não deixava lugar para um construtor.** Um piloto contava como acessível se o preço coubesse no dinheiro restante, sem reservar nada para os lugares ainda vagos: quatro pilotos do Pit Wall com $65 não deixavam nenhum construtor que pudesses comprar, e o Pit Wall marcava precisamente o piloto que o causava. Uma linha só é agora acessível se o fecho mais barato dos lugares vagos, construtor incluído enquanto nenhum estiver escolhido, ainda couber depois; a linha de orçamento conta o construtor como um lugar e o distintivo LEAVES diz para que é o dinheiro.
- **Escolhas que não se podiam guardar.** SAVE LINEUP esperava por cinco pilotos e um construtor, por isso quatro escolhas não podiam ficar sem um construtor que não podias pagar. Uma equipa alterada guarda-se agora tal como está, o resumo nomeia os lugares vagos e diz que se preenchem sozinhos no bloqueio, e sair com escolhas por guardar (CANCEL, o botão de retroceder ou o gesto do iOS) pergunta primeiro.
- **O distintivo PIT WALL PICK por cima dos números.** O distintivo ficava ao lado do nome da equipa e entrava pela coluna de projeção. A dica do Pit Wall é agora a linha inteira, destacada, com a etiqueta numa linha própria por cima do nome; BEST VALUE e as dicas de combinação ficam numa linha por baixo do nome da equipa.
