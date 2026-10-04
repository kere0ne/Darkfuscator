--!strict
type Point = { x: number, y: number }
local function dist(a: Point, b: Point): number
  return math.sqrt((a.x - b.x)^2 + (a.y - b.y)^2)
end
local p: Point = { x = 0, y = 0 }
local q: Point = { x = 3, y = 4 }
print(dist(p, q))
local generic = function<T>(v: T): T return v end
print(generic(42))
local s: string = `interp {1 + 2} end`
print(s)
local arr: {number} = { 1, 2, 3 }
local sum = 0
for _, v in ipairs(arr) do sum += v end
print(sum)
type Fn = (number) -> number
local apply: Fn = function(n) return n * 2 end
print(apply(21))
