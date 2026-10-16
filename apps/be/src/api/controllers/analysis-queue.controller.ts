import { Body, Controller, Get, Post, Query, Route, Security, SuccessResponse, Path } from 'tsoa';
import { Service } from 'typedi';
import { AnalysisQueueService } from '../../services/analysis-queue.service.js';
import type {
  ReceiptBody,
  ReceiptView,
  ScanBody,
  QueueCapacityDto,
  ScanReceiptDto,
  ScanStatusDto,
  ScanSealDto,
  ScanSealBody,
  ResultAckBody,
} from '../../dto/analysis-queue.dto.js';
import { apiSuccess, ApiResponse } from '../../dto/api-response.dto.js';

@Service()
@Route('api/v1/internal/analysis-queue')
@Security('service')
export class AnalysisQueueController extends Controller {
  constructor(private queue: AnalysisQueueService) {
    super();
  }
  @Post('receipts')
  @SuccessResponse('202', 'Durably received')
  async receive(@Body() body: ReceiptBody): Promise<ApiResponse<ReceiptView>> {
    const receipt = await this.queue.receive(body);
    this.setStatus(202);
    return apiSuccess(receipt);
  }
  @Get('results')
  async results(@Query() ids: string): Promise<ApiResponse<ReceiptView[]>> {
    return apiSuccess(await this.queue.results(ids.split(',').filter(Boolean)));
  }
  @Post('ack')
  async acknowledge(@Body() body: ResultAckBody): Promise<ApiResponse<null>> {
    await this.queue.acknowledge(body.ids);
    return apiSuccess(null);
  }
  @Get('capacity')
  async capacity(): Promise<ApiResponse<QueueCapacityDto>> {
    return apiSuccess(await this.queue.metrics());
  }
  @Post('scans')
  async startScan(@Body() body: ScanBody): Promise<ApiResponse<ScanReceiptDto>> {
    const scan = await this.queue.startScan(body);
    return apiSuccess({ id: scan.id, state: scan.state });
  }
  @Post('scans/{id}/seal')
  async seal(@Path() id: string, @Body() body: ScanSealBody): Promise<ApiResponse<ScanSealDto>> {
    return apiSuccess(await this.queue.sealScan(id, body.expectedRanges));
  }
  @Get('scans/{id}')
  async scan(@Path() id: string): Promise<ApiResponse<ScanStatusDto>> {
    return apiSuccess(await this.queue.scanStatus(id));
  }
}
