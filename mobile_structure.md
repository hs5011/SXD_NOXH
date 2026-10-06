# Mobile Flutter Structure

## Folder Structure
```
mobile-flutter/
├── lib/
│   ├── core/
│   │   ├── api/
│   │   ├── constants/
│   │   └── theme/
│   ├── data/
│   │   ├── models/
│   │   ├── repositories/
│   │   └── datasources/
│   ├── logic/ (Bloc/Provider/Riverpod)
│   │   ├── auth/
│   │   ├── project/
│   │   └── workflow/
│   ├── presentation/
│   │   ├── screens/
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   ├── project_list/
│   │   │   └── project_detail/
│   │   ├── widgets/
│   │   └── routes/
│   └── main.dart
├── assets/
│   ├── images/
│   └── fonts/
└── pubspec.yaml
```

## Sample Screen (Project Detail)
```dart
class ProjectDetailScreen extends StatelessWidget {
  final String projectId;
  const ProjectDetailScreen({Key? key, required this.projectId}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Chi tiết Dự án')),
      body: BlocBuilder<ProjectBloc, ProjectState>(
        builder: (context, state) {
          if (state is ProjectLoading) return Center(child: CircularProgressIndicator());
          if (state is ProjectLoaded) {
            final project = state.project;
            return ListView(
              children: [
                ProjectHeader(project: project),
                WorkflowTimeline(steps: project.workflowSteps),
                DocumentList(documents: project.documents),
              ],
            );
          }
          return ErrorWidget('Failed to load project');
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showUpdateStatusDialog(context),
        child: Icon(Icons.edit),
      ),
    );
  }
}
```
