-- interpolated strings, including nesting and tricky braces
local name, age = "Ada", 36
print(`{name} is {age}`)
print(`literal braces: \{not_a_var\}`)
print(`nested {`in{`{name}`}ner`}`)
local t = { a = { b = { c = "deep" } } }
print(`{t.a.b.c}`)
print(`{ #({ 1, 2, 3 }) }`)
print(`{"quoted"}`)
print(`{ ('%s'):format("fmt") }`)
print(`count {1} {2} {3}`)
print(`mixed {name} text {age} more`)
local function f(x) return `got {x}` end
print(f(`{name}`))
print(`empty literal {"x"} between`)
print(`{ if age > 18 then "adult" else "minor" }`)
