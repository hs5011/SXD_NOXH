# Backend NestJS Structure

## Folder Structure
```
backend-nestjs/
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── jwt.strategy.ts
│   ├── projects/
│   │   ├── projects.controller.ts
│   │   ├── projects.service.ts
│   │   └── entities/project.entity.ts
│   ├── workflow/
│   │   ├── workflow.controller.ts
│   │   ├── workflow.service.ts
│   │   └── engine/workflow-engine.service.ts
│   ├── documents/
│   │   ├── documents.controller.ts
│   │   └── documents.service.ts
│   ├── dashboard/
│   │   ├── dashboard.controller.ts
│   │   └── dashboard.service.ts
│   ├── common/
│   │   ├── decorators/
│   │   ├── guards/
│   │   └── interceptors/
│   ├── main.ts
│   └── app.module.ts
├── test/
├── prisma/ (or TypeORM)
│   └── schema.prisma
└── package.json
```

## Sample API Controller (Projects)
```typescript
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @Roles(Role.LEADER, Role.SPECIALIST)
  findAll(@Query() filter: ProjectFilterDto) {
    return this.projectsService.findAll(filter);
  }

  @Post()
  @Roles(Role.ADMIN, Role.INVESTOR)
  create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id/workflow')
  updateWorkflow(@Param('id') id: string, @Body() updateDto: UpdateWorkflowDto) {
    return this.projectsService.updateWorkflow(id, updateDto);
  }
}
```
