import AVFoundation
import CoreVideo

/// A real video track is necessary for PiP; an audio-only WAV in a video
/// element can exercise seek/play but cannot exercise video presentation.
func generateNativeVideo(at url: URL) throws {
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 320, AVVideoHeightKey: 180
    ])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: 320, kCVPixelBufferHeightKey as String: 180
    ])
    writer.add(input)
    guard writer.startWriting() else { throw writer.error! }
    writer.startSession(atSourceTime: .zero)
    var buffer: CVPixelBuffer?
    guard CVPixelBufferCreate(kCFAllocatorDefault, 320, 180, kCVPixelFormatType_32ARGB, nil, &buffer) == kCVReturnSuccess,
          let pixels = buffer else { throw NSError(domain: "NativeMedia", code: 1) }
    CVPixelBufferLockBaseAddress(pixels, [])
    memset(CVPixelBufferGetBaseAddress(pixels), 100, CVPixelBufferGetDataSize(pixels))
    CVPixelBufferUnlockBaseAddress(pixels, [])
    let deadline = Date().addingTimeInterval(10)
    for frame in 0...180 {
        while !input.isReadyForMoreMediaData {
            guard writer.status == .writing, Date() < deadline else { throw writer.error ?? NSError(domain: "NativeMedia", code: 2) }
            Thread.sleep(forTimeInterval: 0.001)
        }
        guard adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 1)) else { throw writer.error! }
    }
    input.markAsFinished()
    let finished = DispatchSemaphore(value: 0)
    writer.finishWriting { finished.signal() }
    guard finished.wait(timeout: .now() + 10) == .success, writer.status == .completed else { throw writer.error ?? NSError(domain: "NativeMedia", code: 3) }
}
