-- runtime error: output should differ only in line numbers
local function boom(n)
  if n <= 0 then error("boom happened") end
  return boom(n - 1)
end
print("before")
boom(3)
print("never")
