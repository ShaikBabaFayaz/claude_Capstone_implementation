package com.example.taskmanagement.service;

import com.example.taskmanagement.domain.Task;
import com.example.taskmanagement.domain.TaskStatus;
import com.example.taskmanagement.dto.PageResponse;
import com.example.taskmanagement.dto.TaskCreateRequest;
import com.example.taskmanagement.dto.TaskPatchRequest;
import com.example.taskmanagement.dto.TaskReplaceRequest;
import com.example.taskmanagement.dto.TaskResponse;
import com.example.taskmanagement.repository.TaskRepository;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

    private final TaskRepository taskRepository;

    public TaskService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    @Transactional
    public TaskResponse create(TaskCreateRequest request) {
        Task task = new Task();
        task.setTitle(request.getTitle());
        task.setDescription(request.getDescription());
        Optional<TaskStatus> status = request.getStatus();
        task.setStatus(status != null && status.isPresent() ? status.get() : TaskStatus.TODO);
        return TaskResponse.from(taskRepository.saveAndFlush(task));
    }

    @Transactional(readOnly = true)
    public TaskResponse get(Long id) {
        return TaskResponse.from(find(id));
    }

    @Transactional(readOnly = true)
    public PageResponse<TaskResponse> list(int page, int size) {
        Page<Task> result = taskRepository.findAll(PageRequest.of(page, size, Sort.by("id").ascending()));
        return new PageResponse<>(
                result.getContent().stream().map(TaskResponse::from).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages());
    }

    @Transactional
    public TaskResponse replace(Long id, TaskReplaceRequest request) {
        Task task = find(id);
        task.setTitle(request.getTitle());
        task.setDescription(request.getDescription());
        task.setStatus(request.getStatus());
        return TaskResponse.from(taskRepository.saveAndFlush(task));
    }

    @Transactional
    public TaskResponse patch(Long id, TaskPatchRequest request) {
        // null reference = property absent; Optional.empty() = explicit JSON null.
        if (request.getTitle() == null && request.getDescription() == null && request.getStatus() == null) {
            throw new EmptyPatchException();
        }
        Task task = find(id);
        if (request.getTitle() != null) {
            task.setTitle(request.getTitle().orElseThrow(() -> new InvalidPatchException("title")));
        }
        if (request.getDescription() != null) {
            task.setDescription(request.getDescription().orElse(null));
        }
        if (request.getStatus() != null) {
            task.setStatus(request.getStatus().orElseThrow(() -> new InvalidPatchException("status")));
        }
        return TaskResponse.from(taskRepository.saveAndFlush(task));
    }

    @Transactional
    public void delete(Long id) {
        taskRepository.delete(find(id));
    }

    private Task find(Long id) {
        return taskRepository.findById(id).orElseThrow(() -> new TaskNotFoundException(id));
    }
}
