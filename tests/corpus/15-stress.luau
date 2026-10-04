-- larger synthetic program: many functions, closures and table work
local registry = {}
local function register(name, fn)
  registry[name] = fn
  return fn
end

local ops = {
  add = function(a, b) return a + b end,
  sub = function(a, b) return a - b end,
  mul = function(a, b) return a * b end,
  div = function(a, b) return b ~= 0 and a / b or 0 end,
}

for name, fn in pairs(ops) do
  register(name, fn)
end

local results = {}
for i = 1, 200 do
  local row = {}
  for j = 1, 5 do
    local op = (i + j) % 4
    if op == 0 then row[j] = ops.add(i, j)
    elseif op == 1 then row[j] = ops.sub(i, j)
    elseif op == 2 then row[j] = ops.mul(i, j)
    else row[j] = ops.div(i, j) end
  end
  results[i] = row
end

local total = 0
for i = 1, #results do
  for j = 1, #results[i] do
    total += results[i][j]
  end
end
print("total", math.floor(total))

local function deep(n)
  if n == 0 then return { value = 0 } end
  return { value = n, child = deep(n - 1) }
end
local node = deep(50)
local depth = 0
while node do depth += 1 node = node.child end
print("depth", depth)

local lookup = {}
for i = 1, 500 do lookup["key_" .. i] = i end
local found = 0
for k, v in pairs(lookup) do if v % 100 == 0 then found += 1 end end
print("found", found)

local sorted = {}
for i = 1, 50 do sorted[i] = (i * 37) % 50 end
table.sort(sorted, function(a, b) return a < b end)
print("sorted", sorted[1], sorted[25], sorted[50])

local text = {}
for i = 1, 100 do text[i] = tostring(i) end
print("joined len", #table.concat(text, ","))
