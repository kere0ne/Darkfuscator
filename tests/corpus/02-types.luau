--!strict
type Point = { x: number, y: number, label: string? }
type Callback = (number, string) -> boolean
type Maybe<T> = T?

local p: Point = { x = 1, y = 2, label = "origin" }
print(p.x, p.y, p.label)

local cb: Callback = function(n: number, s: string): boolean
  return n > 0 and #s > 0
end
print(cb(1, "a"), cb(0, "a"))

local function first<T>(list: { T }): T?
  return list[1]
end
print(first({ 7, 8, 9 }))

local function pair<A, B>(a: A, b: B): (A, B)
  return a, b
end
local m, n2 = pair("x", 5)
print(m, n2)

local cast = 4 :: any
print(type(cast))

local num: number = 3
num *= 2
print(num)

for i: number = 1, 2 do print("typedfor", i) end

local container = {}
function container:method<T>(v: T): T return v end
print(container:method("gen"))

type Fn = <A>(A) -> A
local id: Fn = function(v) return v end
print(id(11))

local union: number | string = "str"
print(union)
