import AppKit
import Foundation
import PDFKit
import Vision

struct OCRLine: Codable {
    let page: Int
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct OCRDocument: Codable {
    let provider: String
    let providerVersion: String
    let pageCount: Int
    let lines: [OCRLine]
}

func fail(_ code: String) -> Never {
    FileHandle.standardError.write(Data("\(code)\n".utf8))
    exit(1)
}

guard CommandLine.arguments.count == 2 else { fail("VISION_OCR_PDF_REQUIRED") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let document = PDFDocument(url: url), document.pageCount > 0 else { fail("VISION_OCR_INVALID_PDF") }

var output: [OCRLine] = []
for pageIndex in 0..<document.pageCount {
    guard let page = document.page(at: pageIndex) else { fail("VISION_OCR_PAGE_MISSING") }
    let bounds = page.bounds(for: .mediaBox)
    let targetWidth: CGFloat = 3000
    let scale = targetWidth / max(bounds.width, 1)
    let targetSize = CGSize(width: targetWidth, height: max(bounds.height * scale, 1))
    let width = Int(targetSize.width.rounded(.up)), height = Int(targetSize.height.rounded(.up))
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("VISION_OCR_RENDER_FAILED") }
    let renderRect = CGRect(origin: .zero, size: targetSize)
    context.setFillColor(NSColor.white.cgColor)
    context.fill(renderRect)
    context.scaleBy(x: scale, y: scale)
    context.translateBy(x: -bounds.minX, y: -bounds.minY)
    page.draw(with: .mediaBox, to: context)
    guard let cgImage = context.makeImage() else { fail("VISION_OCR_RENDER_FAILED") }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["es-ES", "en-US"]
    request.minimumTextHeight = 0.006
    do {
        try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    } catch {
        fail("VISION_OCR_REQUEST_FAILED")
    }
    let observations = request.results ?? []
    let lines = observations.compactMap { observation -> OCRLine? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return OCRLine(
            page: pageIndex + 1,
            text: candidate.string,
            confidence: candidate.confidence,
            x: box.origin.x,
            y: box.origin.y,
            width: box.size.width,
            height: box.size.height
        )
    }.sorted {
        if abs($0.y - $1.y) > 0.008 { return $0.y > $1.y }
        return $0.x < $1.x
    }
    output.append(contentsOf: lines)
}

let result = OCRDocument(
    provider: "APPLE_VISION_OCR",
    providerVersion: "VNRecognizeTextRequest.accurate-v2-white-background+interpretation-v3",
    pageCount: document.pageCount,
    lines: output
)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
guard let data = try? encoder.encode(result) else { fail("VISION_OCR_ENCODING_FAILED") }
FileHandle.standardOutput.write(data)
