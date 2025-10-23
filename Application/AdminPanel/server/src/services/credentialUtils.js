export function slugifyName(name){
  return (name||'user').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,12) || 'user'
}

export function randDigits(n){
  let s=''; for(let i=0;i<n;i++) s+=Math.floor(Math.random()*10);
  return s
}

export function generateUsername(name, hint){
  const base = slugifyName(name)
  const tail = (String(hint||'').replace(/\D/g,'').slice(-3)) || randDigits(3)
  return `${base}${tail}`
}

export function generatePassword(name){
  const base = slugifyName(name).slice(0,4) || 'user'
  return `${base}${randDigits(4)}!`
}
