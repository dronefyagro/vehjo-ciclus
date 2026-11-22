import { NextResponse } from "next/server";
import { OFFICIAL_TAX_ENGINES } from "../../lib/taxation";
import { rejectUnsafeMutation } from "../../lib/api-guard";

export async function GET() {
  return NextResponse.json({
    service: "Ciclus Tax Engine",
    operational: false,
    status: "foundation",
    message: "Os motores oficiais estão catalogados, mas ainda aguardam implantação isolada, testes e homologação.",
    engines: OFFICIAL_TAX_ENGINES,
  });
}

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request);
  if (rejected) return rejected;
  return NextResponse.json(
    {
      error: "Cálculo oficial indisponível até a conclusão da implantação e homologação dos motores da Receita Federal.",
      operational: false,
    },
    { status: 503 },
  );
}

