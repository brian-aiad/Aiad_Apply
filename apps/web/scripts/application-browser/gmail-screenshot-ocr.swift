import AppKit
import Foundation
import Vision

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let image = NSImage(data: data) else {
    FileHandle.standardError.write(Data("Could not decode the verification email screenshot.\n".utf8))
    exit(2)
}

var imageRect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &imageRect, context: nil, hints: nil) else {
    FileHandle.standardError.write(Data("Could not decode the verification email screenshot.\n".utf8))
    exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cgImage).perform([request])
let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
FileHandle.standardOutput.write(Data(lines.joined(separator: "\n").utf8))
