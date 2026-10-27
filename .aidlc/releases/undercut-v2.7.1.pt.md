# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: corrige a falha ao abrir na 2.7.0, faz o resumo do fim de semana contar o teu fim de semana como foi pontuado, um resumo por equipa, e mantém o Moonshot ligado depois de um novo início de sessão.

## Corrigido

- **Falha ao abrir na 2.7.0.** A 2.7.0 foi compilada sem a sua configuração web do Firebase e parava no ecrã inicial em todas as plataformas. A 2.7.1 tem as mesmas funcionalidades compiladas corretamente, e os scripts de compilação recusam agora um pacote sem essa configuração.
- **Moonshot desligado depois de iniciar sessão.** A app lia a configuração uma vez ao arrancar, por vezes antes de a sessão ser restaurada, e mantinha os valores predefinidos durante toda a sessão: o contador de Moonshots, o cartão Moonshot do resumo e a linha da próxima ronda ficavam escondidos até um arranque a frio. A configuração é agora lida de novo assim que o início de sessão é conhecido.

## Alterações

- **Resumo do fim de semana a partir do registo.** O resumo mostra agora os teus pontos tal como o servidor os pontuou, escolha a escolha, com ACE ×2, TEAM e AUTO assinalados e as escolhas com 0 pontos numa só linha; FIELDED n OF 6 quando havia lugares vazios; a tua posição na ronda com a distância ao vencedor e a tua posição na época com a sua evolução; o teu Moonshot liquidado com o total do fim de semana; e a próxima ronda com o seu bloqueio e o teu Moonshot nela. O cartão indica a equipa, e quem tem duas equipas recebe um resumo por equipa.
