param([ValidateSet('chess', 'poker')][string]$Profile = 'chess')
Push-Location -LiteralPath $PSScriptRoot
try { & node cli.mjs serve $Profile }
finally { Pop-Location }
