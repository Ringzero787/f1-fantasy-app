# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: o mercado continua aberto enquanto sua escalação está bloqueada, seu Moonshot aparece no resumo do fim de semana, o contador de Moonshots conta no bloqueio, e a dica de ás do Pit Wall abre a ficha do piloto. No servidor, os resultados agora chegam na hora porque o feed de tempos é lido com a chave paga (isso não precisa de uma nova versão).

## Novidades

- **Mercado durante o bloqueio.** MARKET na linha da equipe abre o seletor como um mercado só de leitura durante todo o fim de semana de corrida: preços, pontos e projeções, nada para tocar. A barra de salvar mostra LOCKED · AUTO-FILL ON.
- **Moonshot no resumo do fim de semana.** Um cartão entre os pontos do fim de semana e os pontuadores mostra sua aposta, a chegada do piloto e os pontos, e uma linha soma escalação e Moonshot no total do fim de semana. Uma aposta em dinheiro é nomeada como dinheiro; uma anulada diz que o token voltou.
- **Pontuação ao vivo no dia da corrida, desativada.** O código para um LIVE +N em cada bloco e uma estatística LIVE · SO FAR durante a corrida está nesta versão, mas nada aparece até o interruptor de tempos ao vivo ser ligado após a confirmação por escrito do fornecedor de tempos.

## Alterações

- **Contador de Moonshots.** Um token conta como usado quando sua aposta bloqueia, não quando você a faz, já que uma aposta aberta ainda pode ser cancelada com reembolso total: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, depois ONE USED THIS WEEKEND.
- **Dica de ás primeiro.** O ACE CALL do Pit Wall é o primeiro bloco da ficha do piloto, abaixo do nome e da equipe; quando a dica é fazer deste piloto o ás, MAKE ACE · 2× POINTS fica bem ali e o botão de baixo desaparece.
