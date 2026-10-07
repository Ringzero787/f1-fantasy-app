# uc-v2.5.0 — 2026-10-07

Previsões de corrida Moonshot, edição do nome do time e melhorias no cronometragem ao vivo no Undercut 2.5.0.

## Adicionado

- **Moonshot**: a partir da rodada 13, um time atrás na sua liga pode fazer um call em um piloto para a próxima corrida — vitória, pódio, pontos ou superar um rival — arriscando parte dos pontos da temporada ou do orçamento do elenco. Um acerto soma a recompensa ao total da temporada; um erro custa o que foi arriscado. Disponível nas visualizações de time e liga, com orientação na primeira utilização.
- Captação de dados de cronometragem ao vivo no dia da corrida, distribuída pelo Firestore para atualizações em tempo real.
- Possibilidade de renomear o nome do seu time e o nome de exibição do gerente pelo portal Pit Wall; as alterações sincronizam em todos os seus dispositivos.
- Fonte Archivo no aplicativo, igual ao portal web Pit Wall.

## Alterado

- A sincronização dos metadados do time agora é mais inteligente: somente as alterações locais do seu dispositivo são enviadas ao Firestore, evitando reversões causadas por edições feitas em outro lugar.
- O horário de travamento da escalação exibido no app agora corresponde ao horário de travamento aplicado pelo servidor.

## Corrigido

- Reforços de segurança aplicados antes do lançamento da versão 2.5.0.
- A criação de ligas não concede mais recursos pagos sem o licenciamento adequado.
- Os IDs de liga do time agora são validados como IDs de documento utilizáveis no Firestore.
- A sincronização de metadados não sobrescreve mais cópias mais recentes do servidor durante as atualizações periódicas.
