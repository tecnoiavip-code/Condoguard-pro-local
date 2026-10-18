-- Corrige correspondencias gravadas sem received_at: o insert do app local nao
-- enviava o campo e a coluna nao tem DEFAULT, entao a tela "Pendentes de
-- Retirada" exibia 31/12/1969. A data real de recebimento nao ficou registrada,
-- por isso usamos o horario atual como correcao.
--
-- Banco alvo: C:\ProgramData\PortalGuard\portalguard.db
-- (o codigo ja foi corrigido; este script apenas conserta os registros antigos)
UPDATE mails
SET received_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE received_at IS NULL OR received_at = '';
